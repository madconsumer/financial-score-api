import { promises as fs } from 'fs';
import path from 'path';
import { OpenAI } from 'openai';

export const config = {
  api: {
    bodyParser: true
  }
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { answers, name } = req.body;

    const filePath = path.resolve('./data/survey_scoring_rubric.json');
    const rubricRaw = await fs.readFile(filePath, 'utf-8');
    const rubric = JSON.parse(rubricRaw);

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

    const messages = [
      {
        role: 'system',
        content: 'You are a friendly financial coach that explains someone’s financial survey results in helpful, clear language. Don’t give investment advice, just thoughtful commentary.'
      },
      {
        role: 'user',
        content: `User: ${name}\nScore: ${percentile} percentile\nAnswers: ${JSON.stringify(answers)}\nProvide 1-2 paragraphs of personalized commentary on their financial situation.`
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
