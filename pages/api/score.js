// pages/api/score.js

import { readFileSync } from 'fs'
import path from 'path'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end('Method Not Allowed')
  }

  try {
    const { name, answers } = req.body

    // Load rubric
    const rubricPath = path.resolve(process.cwd(), 'data/survey_scoring_rubric.json')
    const rubric = JSON.parse(readFileSync(rubricPath, 'utf8'))

    // Score answers
    let score = 0
    for (let i = 0; i < answers.length; i++) {
      const q = rubric[i]
      const match = q.responses.find(r => r.response === answers[i])
      score += match ? match.points : 0
    }

    // Compute percentile (naive scale of 0–100)
    const maxScore = rubric.reduce((acc, q) => acc + Math.max(...q.responses.map(r => r.points)), 0)
    const percentile = Math.round((score / maxScore) * 100)

    // Prompt GPT for feedback
    const systemPrompt = `You are a friendly and insightful financial coach. A user just completed a personal finance survey. Your job is to interpret their answers and provide thoughtful, encouraging feedback. Highlight their financial strengths and gently point out one area they could improve, using plain language. Do not just repeat their answers. Instead, infer habits or patterns and give practical, engaging insights they can relate to. Avoid giving investment advice or legal recommendations.`

    const userPrompt = `Here is the user's financial profile:\n- Score percentile: ${percentile}th\n- Responses: ${JSON.stringify(answers)}\n\nPlease generate friendly, encouraging feedback summarizing what they’re doing well and what they could improve.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 800,
    })

    res.status(200).json({
      percentile,
      feedback: completion.choices[0].message.content.trim(),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Something went wrong while processing your survey. Please try again.' })
  }
}
