import { getBank } from '../data/banks';
function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
function shuffleQuestionChoices(q) {
    if (!q.choices?.length || q.correctAnswer == null)
        return q;
    const correctText = q.choices.find((c) => c.id === String(q.correctAnswer))?.text;
    if (correctText == null)
        return q;
    const shuffled = shuffle(q.choices);
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const choices = shuffled.map((c, i) => ({ id: ids[i] ?? `o${i}`, text: c.text }));
    const correctAnswer = choices.find((c) => c.text === correctText)?.id ?? q.correctAnswer;
    return { ...q, choices, correctAnswer };
}
export function generateExam(options) {
    let pool = getBank(options.category, options.role, options.level);
    if (options.topics?.length) {
        pool = pool.filter((q) => options.topics.includes(q.topic));
    }
    if (options.difficulty && options.difficulty !== 'mixed') {
        pool = pool.filter((q) => q.difficulty === options.difficulty);
    }
    if (options.questionTypes?.length) {
        pool = pool.filter((q) => options.questionTypes.includes(q.type));
    }
    const selected = shuffle(pool)
        .slice(0, Math.min(options.questionCount, pool.length))
        .map(shuffleQuestionChoices);
    const config = {
        id: `exam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: options.title,
        category: options.category,
        role: options.role,
        level: options.level,
        capacity: options.capacity,
        questionCount: selected.length,
        topics: options.topics,
        difficulty: options.difficulty ?? 'mixed',
        createdAt: new Date().toISOString(),
        questionIds: selected.map((q) => q.id),
    };
    return { config, questions: selected };
}
