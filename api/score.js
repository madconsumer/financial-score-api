import { promises as fs } from 'fs'
import path from 'path'
import { OpenAI } from 'openai'

export const config = {
  api: {
    bodyParser: true
  }
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export default async function handler(req, res) {
  // CORS HEADERS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const { answers, name } = req.body

    const filePath = path.resolve('./data/survey_scoring_rubric.json')
    const rubricRaw = await fs.readFile(filePath, 'utf-8')
    const rubric = JSON.parse(rubricRaw)

    let totalScore = 0
    for (const [index, answer] of answers.entries()) {
      const q = rubric[index]
      const match = q.responses.find(r => r.response === answer)
      if (match) totalScore += Number(match.points)
    }

    const maxScore = rubric.reduce((sum, q) => {
      const max = Math.max(...q.responses.map(r => Number(r.points)))
      return sum + max
    }, 0)

    const percentile = Math.round((totalScore / maxScore) * 100)

    const messages = [
      {
        role: 'system',
        content:
          'You are a friendly financial coach who explains a user’s financial survey results. Be clear, positive, and encouraging. Do not give investment advice. End with one improvement suggestion.'
      },
      {
        role: 'user',
        content: `User: ${name}\nScore: ${percentile} percentile\nAnswers: ${JSON.stringify(
          answers
        )}\nPlease provide a short paragraph of personalized commentary.`
      }
    ]

    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages,
      temperature: 0.7,
      max_tokens: 200
    })

    const feedback = chatResponse.choices[0].message.content

    res.status(200).json({ percentile, feedback })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal Server Error' })
  }
}
