import { servicesRaw } from './expandedServices.mjs'
import { administrationRaw } from './expandedAdministration.mjs'
import { technicalRaw } from './expandedTechnical.mjs'
import { engineeringRaw } from './expandedEngineering.mjs'
import { competenciesRaw, sharedWorkRaw } from './expandedCompetencies.mjs'

function parseRows(text, category) {
  return text.trim().split('\n').map((line) => {
    if (category === 'personality') {
      const [trait, question, difficulty, reverse] = line.split('|')
      return { type:'scale', trait, skill:trait, topic:trait, text:question, difficulty, reverse:reverse === 'reverse' }
    }
    const [skill, question, answerKey, difficulty, ...distractors] = line.split('|')
    if (!skill || !question || !answerKey || !['easy','medium','hard','advanced'].includes(difficulty) || (distractors.length && distractors.length !== 3)) throw new Error('Invalid authored row: ' + line)
    return { type:category === 'oral' ? 'oral' : distractors.length ? 'mcq' : 'open', skill, topic:skill, text:question, answerKey, difficulty,
      ...(distractors.length ? { choices:[answerKey,...distractors] } : {}) }
  })
}
const parseContent = (content) => Object.fromEntries(Object.entries(content).map(([category, rows]) => [category,parseRows(rows,category)]))
export const expandedContent = Object.fromEntries(Object.entries({ ...servicesRaw,...administrationRaw,...technicalRaw,...engineeringRaw }).map(([id, content]) => [id,parseContent(content)]))
export const familyContent = Object.fromEntries(Object.entries(competenciesRaw).map(([id, content]) => [id,parseContent(content)]))
export const sharedWorkContent = parseContent(sharedWorkRaw)
