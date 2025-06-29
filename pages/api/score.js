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
  console.log('Request method:', req.method)
  console.log('Request headers:', req.headers)

  // Set comprehensive CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Origin, X-Requested-With')
  res.setHeader('Access-Control-Max-Age', '86400')

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request')
    return res.status(200).end()
  }

  // Only allow POST requests for the actual endpoint
  if (req.method !== 'POST') {
    console.log('Method not allowed:', req.method)
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    console.log('Processing POST request')
    const { answers, name } = req.body
    console.log('Received data:', { name, answersLength: answers?.length })

    const filePath = path.join(process.cwd(), 'data/survey_scoring_rubric.json')
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
  "role": "system",
  "content": "You are a friendly and insightful financial coach. A user just completed a personal finance survey. Your job is to interpret their answers and provide thoughtful, encouraging feedback. Highlight their financial strengths and gently point out one area they could improve, using plain language. Do not just repeat their answers. Instead, infer habits or patterns and give practical, engaging insights they can relate to. Avoid giving investment advice or legal recommendations."
},
      {
  role: "user",
  content: `Here is the user's financial profile:\n- Score percentile: ${percentile}th\n- Responses: ${JSON.stringify(answers)}\n\nPlease generate friendly, encouraging feedback summarizing what they’re doing well and what they could improve.`
}

    ]

    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.7,
      max_tokens: 700
    })

    const feedback = chatResponse.choices[0].message.content
    console.log('Sending response:', { percentile, feedback: feedback.substring(0, 50) + '...' })

    return res.status(200).json({ percentile, feedback:chatResponse.choices[0].message.content.trim(), })
  } catch (err) {
    console.error('Error:', err)
    return res.status(500).json({ error: 'Internal Server Error', details: err.message })
  }
}
