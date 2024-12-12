require("dotenv").config();
const { OpenAI } = require("openai");

console.log(
  "OpenAI API Key:",
  process.env.OPENAI_API_KEY ? "Detected" : "Not found"
);

async function testOpenAI() {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt =
      "Hello, can you summarize the meaning of life in one sentence?";

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Hoặc "gpt-3.5-turbo" nếu bạn không có quyền truy cập GPT-4
      messages: [{ role: "user", content: prompt }],
      max_tokens: 50,
      temperature: 0.7,
    });

    console.log("Response:", response.choices[0].message.content);
  } catch (error) {
    console.error("Error calling OpenAI:", error);
  }
}

testOpenAI();
