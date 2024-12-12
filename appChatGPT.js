const express = require("express");
const puppeteer = require("puppeteer");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { OpenAI } = require("openai");
require("dotenv").config();

// Cấu hình OpenAI
console.log("conf ", process.env.OPENAI_API_KEY);
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Đảm bảo bạn đã đặt biến môi trường OPENAI_API_KEY
});

// Hàm gọi API ChatGPT (model o1 - ở đây giả sử là GPT-4, bạn có thể thay bằng model mới nhất mà bạn có)
async function callOpenAI(prompt) {
  try {
    const response = await openai.chat.completions.create({
      model: "o1-mini", // hoặc model khác nếu bạn có "o1"
      messages: [{ role: "user", content: prompt }],
      //   max_tokens: 65536,
      max_completion_tokens: 65536,
      temperature: 1,
      //   top_p: 0.95,
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error calling OpenAI:", error);
    throw error;
  }
}

// Hàm delay
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Hàm lấy nội dung từ một URL
const getContentFromUrl = async (url) => {
  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });

    const pageContentSpan = await page.evaluate(() => {
      const elements = document.querySelectorAll("span");
      return Array.from(elements)
        .map((element) => element.innerText.trim())
        .filter((text) => text.length > 50);
    });
    console.log("pageContentSpan: ", pageContentSpan);

    const pageContent = await page.evaluate(() => {
      const elements = document.querySelectorAll("p");
      return Array.from(elements)
        .map((element) => element.innerText.trim())
        .filter((text) => text.length > 50);
    });

    await browser.close();
    return pageContentSpan.join("\n") + `\n` + pageContent.join("\n");
  } catch (error) {
    console.error("Error fetching URL:", error);
    return "Không thể lấy nội dung từ link này.";
  }
};

const getContentFromUrlYoutube = async (url) => {
  try {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto("https://downsub.com", { waitUntil: "domcontentloaded" });

    await page.type("#input-31", url);
    await page.click(
      "#app > div > main > div > div:nth-child(1) > div > div.text-center.pb-0.col-sm-10.col-md-8.col-lg-8.col-xl-6.col-12 > form > div > div.v-input__append-outer > button"
    );

    await page.waitForSelector(
      "#app > div > main > div > div.container.ds-info.outlined > div > div.row.no-gutters > div.pr-1.col-sm-7.col-md-6.col-12 > div.flex.mt-5.text-center > div.layout.justify-start.align-center > button:nth-child(2) > span > button"
    );
    await page.click(
      "#app > div > main > div > div.container.ds-info.outlined > div > div.row.no-gutters > div.pr-1.col-sm-7.col-md-6.col-12 > div.flex.mt-5.text-center > div.layout.justify-start.align-center > button:nth-child(2) > span > button"
    );

    await delay(5000);

    const dirPath = "C:\\Users\\LinhKen\\Downloads";
    const files = fs.readdirSync(dirPath);
    const txtFiles = files.filter((file) => file.endsWith(".txt"));
    const newestFile = txtFiles.reduce((prev, curr) => {
      return fs.statSync(path.join(dirPath, curr)).mtime >
        fs.statSync(path.join(dirPath, prev)).mtime
        ? curr
        : prev;
    });
    const content = fs.readFileSync(path.join(dirPath, newestFile), "utf8");
    console.log("content: ", content);

    const data2 = content.replace(/\n/g, " ");
    const data3 = data2.replace(/\s+/g, " ");
    await fs.promises.writeFile("contentYoutube.txt", data3);
    return data3;
  } catch (error) {
    console.error("Error fetching URL:", error);
    return "Không thể lấy nội dung từ link này.";
  }
};

async function generateContent(
  entry,
  limitLength,
  limitLengthMin,
  type = "sucKhoe"
) {
  try {
    console.log("type: ", type);
    const style =
      type === "sucKhoe"
        ? fs.readFileSync("styleSucKhoe.txt", "utf8")
        : fs.readFileSync("styleKinhTe.txt", "utf8");

    const inputContent = entry.customContent || "";
    const linkContents = await Promise.all(entry.links?.map(getContentFromUrl));
    const allContent = [inputContent, ...linkContents.filter(Boolean)].join(
      "\n"
    );

    fs.writeFileSync("input.txt", allContent);

    let retryCount = 0;
    while (retryCount < 5) {
      try {
        const contentGeneratedUsingInstruction =
          await generateContentUsingInstruction(
            style,
            limitLength,
            limitLengthMin
          );
        const finalContent = await generateContentUsingConnectingWords(
          contentGeneratedUsingInstruction
        );
        return finalContent.replaceAll("*", "");
      } catch (error) {
        console.log("error: ", error);
        if (error.code === 429) {
          retryCount++;
          console.warn(
            `Retry attempt ${retryCount}: Waiting before retrying due to rate limit...`
          );
          await delay(2000 * retryCount);
        } else {
          throw error;
        }
      }
    }
    throw new Error("Max retry attempts reached. Please try again later.");
  } catch (error) {
    console.error("Error generating content:", error);
    return `Error: ${error.message}`;
  }
}

async function generateContentUsingInstruction(
  style,
  limitLength = 300,
  limitLengthMin = 250
) {
  console.log("limitLength: ", limitLength);
  console.log("limitLengthMin: ", limitLengthMin);
  const title = ``;
  const input = await fs.readFileSync("input.txt", "utf8");
  const task = `<doc>
    ${input}
    <doc>`;

  const instruction = `### HƯỚNG DẪN
- Bạn là một chuyên gia trong việc tạo ra nội dung chất lượng cao thông qua việc mô phỏng chính xác các phong cách viết cụ thể.

- Nhiệm vụ của bạn là phát triển một bài viết hấp dẫn với tối đa ${limitLength} từ và tối thiểu ${limitLengthMin} từ, số từ rất quan trọng, phải tuân thủ đúng dù đoạn nội dung gốc có dài đến đâu thì tổng số từ vẫn phải đảm bảo số từ nằm trong khoản tối thiểu và tối đa.

- Tiêu đề của bài viết là: ${title}, không để tiêu đề trong cặp dấu **, không sử dụng tiêu đề trong bài viết.

- Chỉ sử dụng các trích đoạn và phong cách viết được cung cấp để tạo ra một tác phẩm cuốn hút, mang tính thông tin, lôi cuốn, và đạt được mục tiêu đã đề ra.

- Trình bày thông tin phức tạp một cách dễ hiểu, cung cấp những thông tin giá trị phù hợp với trình độ kiến thức của đối tượng mục tiêu. Đảm bảo cân bằng giữa sự ngắn gọn và chiều sâu, cung cấp một cái nhìn toàn diện trong khi vẫn duy trì sự gắn kết của người đọc trong suốt bài viết.

- Giọng văn giống người nói chuyện và kể lại như nói chuyện với 1 người bạn, kiểu đưa ra lời khuyên chân thành, gần gũi

- Không dùng giọng văn liệt kê

### NGỮ CẢNH
CÁC TRÍCH ĐOẠN:
${task}

-----------------
PHONG CÁCH VIẾT:
${style}

Cực kì chú ý điều quan trọng, số từ phải nằm trong khoảng từ ${limitLengthMin} đến ${limitLength} từ, không được vượt quá hoặc dưới quá số từ quy định. Nếu không, hệ thống sẽ không chấp nhận bài viết của bạn.
`;

  await delay(10000);
  const resp = await callOpenAI(instruction);
  console.log("content after generate using instruction", resp);
  fs.writeFile("output.txt", resp, (err) => {
    if (err) throw err;
    console.log("The file has been saved!");
  });
  return resp;
}

async function generateContentUsingConnectingWords(output_recursive_prompt) {
  const connecting_words = fs.readFileSync("connectingWord.txt", "utf8");
  const connecting_word_prompt = `
### Hướng dẫn
- Đọc và phân tích đoạn văn dưới đây, sau đó sử dụng các từ kết nối được cung cấp để liên kết các câu có trong đoạn văn lại với nhau.

- Giữ nguyên độ dài và nội dung của đoạn văn gốc, chỉ sử dụng thêm các từ kết nối.

- Không lạm dụng từ kết nối quá nhiều lần cũng như không lặp lại một từ kết nối giữa hai câu liên tiếp.

- Không để các từ nối trong cặp dấu **

### Ngữ cảnh
Danh sách các từ kết nối: ${connecting_words}
------------------------------------------------
Đoạn văn gốc cần viết lại: ${output_recursive_prompt}
`;

  await delay(10000);
  const resp2 = await callOpenAI(connecting_word_prompt);
  console.log("Content generated using connecting words", resp2);
  fs.writeFile("final.txt", resp2, (err) => {
    if (err) throw err;
    console.log("The file has been saved!");
  });
  return resp2;
}

const app = express();
app.use(bodyParser.json());
app.use(cors());

app.post("/api/fetch-content", async (req, res) => {
  const { entries, limitLength, limitLengthMin, type } = req.body;
  const rewriteContents = [];

  for (const entry of entries) {
    try {
      const rewriteContent = await generateContent(
        entry,
        limitLength,
        limitLengthMin,
        type
      );
      rewriteContents.push(rewriteContent);
      await delay(10000);
    } catch (error) {
      console.error("Error during content generation:", error);
      return res.status(500).json({
        error: `Failed to generate content: ${error.message}`,
      });
    }
  }

  res.json({ content: rewriteContents });
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

console.log("Server is starting...");

app.listen(5090, () => {
  console.log("Server is running on http://localhost:5090");
});
