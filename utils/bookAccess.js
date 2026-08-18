const jwt = require('jsonwebtoken');
const ClassGroup = require('../models/ClassGroup');
const { getApiBaseUrl } = require('./fileAccess');

const BOOK_PDF_TOKEN_TTL = '2h';

async function isEnrolledInBookGroup(userId, bookId) {
  const group = await ClassGroup.findOne({ bookId, studentIds: userId }).select('_id');
  return !!group;
}

async function isProfessorOfBookGroup(userId, bookId) {
  const group = await ClassGroup.findOne({ bookId, professorId: userId }).select('_id');
  return !!group;
}

async function findStudentGroupForBook(userId, bookId) {
  return ClassGroup.findOne({ bookId, studentIds: userId }).select('_id name').lean();
}

/**
 * Catalogue visibility (title/cover). Published books remain listable.
 */
async function canReadBookCatalog(req, book) {
  if (!req.user) return book.status === 'published' && book.active !== false;
  if (req.user.role === 'admin') return true;
  if (book.status === 'published' && book.active !== false) return true;
  if (req.user.role === 'professor') {
    if (book.createdBy?.toString() === req.user._id.toString()) return true;
    return isProfessorOfBookGroup(req.user._id, book._id);
  }
  return false;
}

/**
 * PDF / reader / bookmarks / progress.
 * Students: enrolled in a cohort that uses this book, or explicit publicResource.
 * Professors: teach a cohort that uses this book, or created the book.
 * Admins: always.
 */
async function canAccessBookContent(req, book) {
  if (!req.user) return false;
  if (req.user.role === 'admin') return true;

  if (req.user.role === 'professor') {
    if (book.createdBy?.toString() === req.user._id.toString()) return true;
    return isProfessorOfBookGroup(req.user._id, book._id);
  }

  if (req.user.role === 'student') {
    if (book.publicResource === true && book.status === 'published' && book.active !== false) {
      return true;
    }
    return isEnrolledInBookGroup(req.user._id, book._id);
  }

  return false;
}

function signBookPdfAccess(bookId, userId, expiresIn = BOOK_PDF_TOKEN_TTL) {
  return jwt.sign(
    {
      type: 'book_pdf_access',
      bookId: bookId.toString(),
      userId: userId ? userId.toString() : undefined,
    },
    process.env.JWT_SECRET,
    { expiresIn }
  );
}

function verifyBookPdfAccessToken(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (decoded.type !== 'book_pdf_access' || !decoded.bookId) {
    throw new Error('Invalid book PDF token');
  }
  return decoded;
}

function buildBookPdfStreamUrl(bookId, userId, req, expiresIn = BOOK_PDF_TOKEN_TTL) {
  const token = signBookPdfAccess(bookId, userId, expiresIn);
  const base = getApiBaseUrl(req);
  return `${base}/api/books/${bookId}/stream?token=${encodeURIComponent(token)}`;
}

module.exports = {
  isEnrolledInBookGroup,
  isProfessorOfBookGroup,
  findStudentGroupForBook,
  canReadBookCatalog,
  canAccessBookContent,
  signBookPdfAccess,
  verifyBookPdfAccessToken,
  buildBookPdfStreamUrl,
  BOOK_PDF_TOKEN_TTL,
};
