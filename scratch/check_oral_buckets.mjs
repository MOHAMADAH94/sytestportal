import { resolveOralBucket, ORAL_BUCKET_META } from '../shared/evaluationMatrix.js'

for (const t of [
  'مهندس',
  'مهندس شبكات',
  'تقني',
  'تقني خبير',
  'فني',
  'فني شبكات',
  'مهندس برمجيات',
  'مساعد مهندس',
  'مهندس خبير',
]) {
  const b = resolveOralBucket({ jobTitle: t })
  console.log(t, '->', b, ORAL_BUCKET_META[b]?.oralRole)
}
