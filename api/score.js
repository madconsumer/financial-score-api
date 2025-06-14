import { promises as fs } from 'fs';
import path from 'path';
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { answers, name } = req.body;

    const filePath = path.resolve('./data/survey_scoring_rubric.json');
    const rubricRaw = await fs.readFile(filePath, 'utf-8');
    const rubric = JSON.parse(rubricRaw);

    // Scoring
    let totalScore = 0;
    for (const [index, answer] of answers.entries()) {
      const q = rubric[index];
      const match = q.responses.find(r => r.response === answer);
      if (match) totalScore += Number(match.points);
    }

    const maxScore = rubric.reduce((sum, q) => {
      const max = Math.max(...q.responses.map(r => Number(r.points)));
      return sum + max;
    }, 0);

    const percentile = Math.round((totalScore / maxScore) * 100);

    // GPT Commentary
    const messages = [
      {
        role: 'system',
        content: 'You are a financial advisor bot who gives short, clear commentary on a user’s financial survey results. The tone is helpful, conversational, and encouraging. Do not give investment advice. End with one area they could improve.'
      },
      {
        role: 'user',
        content: `User: ${name}\nScore: ${percentile} percentile\nAnswers: ${JSON.stringify(answers)}\nGive a short paragraph of feedback.`
      }
    ];

    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages,
      temperature: 0.7,
      max_tokens: 200
    });

    const feedback = chatResponse.choices[0].message.content;

    res.status(200).json({ percentile, feedback });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
}
