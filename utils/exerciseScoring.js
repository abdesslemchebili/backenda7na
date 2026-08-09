function scoreExercise(exercise, answers) {
  let score = 0;
  let maxScore = 0;
  let needsManualReview = false;
  const answerMap = new Map(answers.map((a) => [String(a.questionId), a.answer]));

  for (const q of exercise.questions) {
    maxScore += q.points || 1;
    const studentAnswer = answerMap.get(String(q._id)) || '';
    if (q.type === 'multiple_choice') {
      if (studentAnswer.trim().toLowerCase() === (q.correctAnswer || '').trim().toLowerCase()) {
        score += q.points || 1;
      }
    } else if (['text', 'writing', 'listening'].includes(q.type)) {
      if (studentAnswer.trim().length > 0) {
        score += Math.floor((q.points || 1) * 0.5);
        needsManualReview = true;
      }
    }
  }

  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const passed = percentage >= exercise.passingScore && !needsManualReview;

  return { score, maxScore, percentage, passed, needsManualReview };
}

module.exports = { scoreExercise };
