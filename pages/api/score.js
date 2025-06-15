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
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  // Handle preflight CORS request
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  // Only allow POST requests
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
          'You are a helpful financial coach who explains a user's financial survey results. Be clear and encouraging. Do not give investment advice. End with one area they could improve.'
      },
      {
        role: 'user',
        content: `User: ${name}\nScore: ${percentile} percentile\nAnswers: ${JSON.stringify(
          answers
        )}\nProvide two personalized paragraphs for the user describing why they received the score they did and how they can improve based on their inputs.`
      }
    ]

    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages,
      temperature: 0.7,
      max_tokens: 200
    })

    const feedback = chatResponse.choices[0].message.content

    return res.status(200).json({ percentile, feedback })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}
