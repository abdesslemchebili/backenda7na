const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

// Configuration du transporteur email (API nodemailer : createTransport, pas createTransporter)
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_PORT === '465', // true pour 465, false pour les autres ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Templates d'emails
const emailTemplates = {
  // Invitation d'utilisateur
  userInvitation: (userData, tempPassword, inviteUrl) => ({
    subject: {
      en: 'Invitation à rejoindre notre école de langues',
      fr: 'Invitation à rejoindre notre école de langues',
      ar: 'دعوة للانضمام إلى مدرستنا للغات'
    },
    html: {
      en: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Welcome to Our Language School!</h2>
          <p>Hello ${userData.firstName},</p>
          <p>You have been invited to join our language learning platform as a <strong>${userData.role}</strong>.</p>
          <p>Here are your login credentials:</p>
          <ul>
            <li><strong>Email:</strong> ${userData.email}</li>
            <li><strong>Temporary Password:</strong> ${tempPassword}</li>
          </ul>
          <p>Please click the button below to set up your account:</p>
          <a href="${inviteUrl}" style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Set Up Account</a>
          <p>For security reasons, please change your password after your first login.</p>
          <p>Best regards,<br>The Language School Team</p>
        </div>
      `,
      fr: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Bienvenue dans notre école de langues !</h2>
          <p>Bonjour ${userData.firstName},</p>
          <p>Vous avez été invité(e) à rejoindre notre plateforme d'apprentissage des langues en tant que <strong>${userData.role}</strong>.</p>
          <p>Voici vos identifiants de connexion :</p>
          <ul>
            <li><strong>Email :</strong> ${userData.email}</li>
            <li><strong>Mot de passe temporaire :</strong> ${tempPassword}</li>
          </ul>
          <p>Veuillez cliquer sur le bouton ci-dessous pour configurer votre compte :</p>
          <a href="${inviteUrl}" style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Configurer le compte</a>
          <p>Pour des raisons de sécurité, veuillez changer votre mot de passe après votre première connexion.</p>
          <p>Cordialement,<br>L'équipe de l'école de langues</p>
        </div>
      `,
      ar: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: rtl;">
          <h2 style="color: #2c3e50;">مرحباً بك في مدرستنا للغات!</h2>
          <p>مرحباً ${userData.firstName}،</p>
          <p>لقد تمت دعوتك للانضمام إلى منصة تعلم اللغات لدينا كـ <strong>${userData.role}</strong>.</p>
          <p>إليك بيانات تسجيل الدخول الخاصة بك:</p>
          <ul>
            <li><strong>البريد الإلكتروني:</strong> ${userData.email}</li>
            <li><strong>كلمة المرور المؤقتة:</strong> ${tempPassword}</li>
          </ul>
          <p>يرجى النقر على الزر أدناه لإعداد حسابك:</p>
          <a href="${inviteUrl}" style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">إعداد الحساب</a>
          <p>لأسباب أمنية، يرجى تغيير كلمة المرور بعد تسجيل الدخول الأول.</p>
          <p>مع أطيب التحيات،<br>فريق مدرسة اللغات</p>
        </div>
      `
    }
  }),

  // Vérification d'email
  emailVerification: (userData, verificationUrl) => ({
    subject: {
      en: 'Verify your email address',
      fr: 'Vérifiez votre adresse email',
      ar: 'تحقق من عنوان بريدك الإلكتروني'
    },
    html: {
      en: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Email Verification Required</h2>
          <p>Hello ${userData.firstName},</p>
          <p>Please verify your email address by clicking the button below:</p>
          <a href="${verificationUrl}" style="background-color: #27ae60; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
          <p>This link will expire in 24 hours.</p>
          <p>If you didn't create an account, please ignore this email.</p>
          <p>Best regards,<br>The Language School Team</p>
        </div>
      `,
      fr: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Vérification d'email requise</h2>
          <p>Bonjour ${userData.firstName},</p>
          <p>Veuillez vérifier votre adresse email en cliquant sur le bouton ci-dessous :</p>
          <a href="${verificationUrl}" style="background-color: #27ae60; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Vérifier l'email</a>
          <p>Ce lien expirera dans 24 heures.</p>
          <p>Si vous n'avez pas créé de compte, veuillez ignorer cet email.</p>
          <p>Cordialement,<br>L'équipe de l'école de langues</p>
        </div>
      `,
      ar: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: rtl;">
          <h2 style="color: #2c3e50;">مطلوب التحقق من البريد الإلكتروني</h2>
          <p>مرحباً ${userData.firstName}،</p>
          <p>يرجى التحقق من عنوان بريدك الإلكتروني بالنقر على الزر أدناه:</p>
          <a href="${verificationUrl}" style="background-color: #27ae60; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">التحقق من البريد الإلكتروني</a>
          <p>سينتهي هذا الرابط خلال 24 ساعة.</p>
          <p>إذا لم تقم بإنشاء حساب، يرجى تجاهل هذا البريد الإلكتروني.</p>
          <p>مع أطيب التحيات،<br>فريق مدرسة اللغات</p>
        </div>
      `
    }
  }),

  // Réinitialisation de mot de passe
  passwordReset: (userData, resetUrl) => ({
    subject: {
      en: 'Password Reset Request',
      fr: 'Demande de réinitialisation de mot de passe',
      ar: 'طلب إعادة تعيين كلمة المرور'
    },
    html: {
      en: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Password Reset Request</h2>
          <p>Hello ${userData.firstName},</p>
          <p>You requested a password reset for your account. Click the button below to reset your password:</p>
          <a href="${resetUrl}" style="background-color: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this reset, please ignore this email.</p>
          <p>Best regards,<br>The Language School Team</p>
        </div>
      `,
      fr: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Demande de réinitialisation de mot de passe</h2>
          <p>Bonjour ${userData.firstName},</p>
          <p>Vous avez demandé une réinitialisation de mot de passe pour votre compte. Cliquez sur le bouton ci-dessous pour réinitialiser votre mot de passe :</p>
          <a href="${resetUrl}" style="background-color: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Réinitialiser le mot de passe</a>
          <p>Ce lien expirera dans 1 heure.</p>
          <p>Si vous n'avez pas demandé cette réinitialisation, veuillez ignorer cet email.</p>
          <p>Cordialement,<br>L'équipe de l'école de langues</p>
        </div>
      `,
      ar: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: rtl;">
          <h2 style="color: #2c3e50;">طلب إعادة تعيين كلمة المرور</h2>
          <p>مرحباً ${userData.firstName}،</p>
          <p>لقد طلبت إعادة تعيين كلمة المرور لحسابك. انقر على الزر أدناه لإعادة تعيين كلمة المرور:</p>
          <a href="${resetUrl}" style="background-color: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">إعادة تعيين كلمة المرور</a>
          <p>سينتهي هذا الرابط خلال ساعة واحدة.</p>
          <p>إذا لم تطلب هذه الإعادة، يرجى تجاهل هذا البريد الإلكتروني.</p>
          <p>مع أطيب التحيات،<br>فريق مدرسة اللغات</p>
        </div>
      `
    }
  }),

  // Notification de statut de paiement
  paymentStatusUpdate: (userData, newStatus) => ({
    subject: {
      en: 'Payment Status Updated',
      fr: 'Statut de paiement mis à jour',
      ar: 'تم تحديث حالة الدفع'
    },
    html: {
      en: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Payment Status Updated</h2>
          <p>Hello ${userData.firstName},</p>
          <p>Your payment status has been updated to: <strong>${newStatus}</strong></p>
          ${newStatus === 'reglo' ? '<p>Your account is now fully activated and you can access all features!</p>' : '<p>Please contact us if you have any questions.</p>'}
          <p>Best regards,<br>The Language School Team</p>
        </div>
      `,
      fr: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Statut de paiement mis à jour</h2>
          <p>Bonjour ${userData.firstName},</p>
          <p>Votre statut de paiement a été mis à jour vers : <strong>${newStatus}</strong></p>
          ${newStatus === 'reglo' ? '<p>Votre compte est maintenant entièrement activé et vous pouvez accéder à toutes les fonctionnalités !</p>' : '<p>Veuillez nous contacter si vous avez des questions.</p>'}
          <p>Cordialement,<br>L'équipe de l'école de langues</p>
        </div>
      `,
      ar: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: rtl;">
          <h2 style="color: #2c3e50;">تم تحديث حالة الدفع</h2>
          <p>مرحباً ${userData.firstName}،</p>
          <p>تم تحديث حالة الدفع الخاصة بك إلى: <strong>${newStatus}</strong></p>
          ${newStatus === 'reglo' ? '<p>حسابك مفعل الآن بالكامل ويمكنك الوصول إلى جميع الميزات!</p>' : '<p>يرجى الاتصال بنا إذا كان لديك أي أسئلة.</p>'}
          <p>مع أطيب التحيات،<br>فريق مدرسة اللغات</p>
        </div>
      `
    }
  })
};

// Fonction principale d'envoi d'email
const sendEmail = async (to, template, language = 'en', customData = {}) => {
  try {
    const transporter = createTransporter();

    let emailTemplate = emailTemplates[template];
    if (!emailTemplate) {
      throw new Error(`Template d'email '${template}' non trouvé`);
    }

    // Les templates sont des fonctions : les appeler avec customData pour obtenir subject/html
    if (typeof emailTemplate === 'function') {
      const args = [customData];
      if (template === 'userInvitation') args.push(customData.tempPassword, customData.inviteUrl);
      else if (template === 'emailVerification') args.push(customData.verificationUrl);
      else if (template === 'passwordReset') args.push(customData.resetUrl);
      else if (template === 'paymentStatusUpdate') args.push(customData.newStatus);
      emailTemplate = emailTemplate(...args);
    }

    const subject = emailTemplate.subject[language] || emailTemplate.subject.en;
    let html = emailTemplate.html[language] || emailTemplate.html.en;

    // Remplacer les variables restantes dans le template (pour templates objet)
    Object.keys(customData).forEach(key => {
      const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
      html = html.replace(regex, customData[key]);
    });

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: to,
      subject: subject,
      html: html
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`Email envoyé avec succès à ${to}:`, result.messageId);
    return result;
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email:', error);
    throw error;
  }
};

// Fonctions spécifiques pour différents types d'emails
const sendUserInvitation = async (userData, tempPassword, language = 'en') => {
  const inviteUrl = `${process.env.FRONTEND_URL}/auth/setup?token=${userData.emailVerificationToken}`;
  
  return sendEmail(
    userData.email,
    'userInvitation',
    language,
    {
      firstName: userData.firstName,
      role: userData.role,
      email: userData.email,
      tempPassword: tempPassword,
      inviteUrl: inviteUrl
    }
  );
};

const sendEmailVerification = async (userData, language = 'en') => {
  // Lien direct vers l'API : au clic, le backend vérifie puis redirige vers le frontend
  const apiBase = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
  const verificationUrl = `${apiBase}/api/auth/verify?token=${userData.emailVerificationToken}`;
  
  return sendEmail(
    userData.email,
    'emailVerification',
    language,
    {
      firstName: userData.firstName,
      verificationUrl: verificationUrl
    }
  );
};

const sendPasswordReset = async (userData, language = 'en') => {
  const resetUrl = `${process.env.FRONTEND_URL}/auth/reset-password?token=${userData.passwordResetToken}`;
  
  return sendEmail(
    userData.email,
    'passwordReset',
    language,
    {
      firstName: userData.firstName,
      resetUrl: resetUrl
    }
  );
};

const sendPaymentStatusUpdate = async (userData, newStatus, language = 'en') => {
  return sendEmail(
    userData.email,
    'paymentStatusUpdate',
    language,
    {
      firstName: userData.firstName,
      newStatus: newStatus
    }
  );
};

// Fonction pour générer un token de vérification
const generateVerificationToken = (userId) => {
  return jwt.sign(
    { userId, type: 'email_verification' },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Fonction pour générer un token de réinitialisation de mot de passe
const generatePasswordResetToken = (userId) => {
  return jwt.sign(
    { userId, type: 'password_reset' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

// Fonction pour générer un mot de passe temporaire
const generateTempPassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

module.exports = {
  sendEmail,
  sendUserInvitation,
  sendEmailVerification,
  sendPasswordReset,
  sendPaymentStatusUpdate,
  generateVerificationToken,
  generatePasswordResetToken,
  generateTempPassword
}; 