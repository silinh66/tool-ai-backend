const express = require("express");
const puppeteer = require("puppeteer");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const { VertexAI } = require("@google-cloud/vertexai");

// Initialize Vertex with your Cloud project and location
const vertex_ai = new VertexAI({
  project: "dautubenvung",
  location: "us-central1",
});
const model = "gemini-1.5-pro-002";

// Instantiate the models
const generativeModel = vertex_ai.preview.getGenerativeModel({
  model: model,
  generationConfig: {
    maxOutputTokens: 8192,
    temperature: 1,
    topP: 0.95,
  },
  safetySettings: [
    {
      category: "HARM_CATEGORY_HATE_SPEECH",
      threshold: "OFF",
    },
    {
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      threshold: "OFF",
    },
    {
      category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      threshold: "OFF",
    },
    {
      category: "HARM_CATEGORY_HARASSMENT",
      threshold: "OFF",
    },
  ],
});

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

    //type link youtube into input #input-31
    await page.type("#input-31", url);

    //click button download #app > div > main > div > div:nth-child(1) > div > div.text-center.pb-0.col-sm-10.col-md-8.col-lg-8.col-xl-6.col-12 > form > div > div.v-input__append-outer > button
    await page.click(
      "#app > div > main > div > div:nth-child(1) > div > div.text-center.pb-0.col-sm-10.col-md-8.col-lg-8.col-xl-6.col-12 > form > div > div.v-input__append-outer > button"
    );

    //wait until button appear then click #app > div > main > div > div.container.ds-info.outlined > div > div.row.no-gutters > div.pr-1.col-sm-7.col-md-6.col-12 > div.flex.mt-5.text-center > div.layout.justify-start.align-center > button:nth-child(2) > span > button
    await page.waitForSelector(
      "#app > div > main > div > div.container.ds-info.outlined > div > div.row.no-gutters > div.pr-1.col-sm-7.col-md-6.col-12 > div.flex.mt-5.text-center > div.layout.justify-start.align-center > button:nth-child(2) > span > button"
    );
    await page.click(
      "#app > div > main > div > div.container.ds-info.outlined > div > div.row.no-gutters > div.pr-1.col-sm-7.col-md-6.col-12 > div.flex.mt-5.text-center > div.layout.justify-start.align-center > button:nth-child(2) > span > button"
    );

    //wailt 5s to download file
    await delay(5 * 1000);

    //get content of newest txt file in C:\Users\LinhKen\Downloads

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

    //remove /n
    const data2 = content.replace(/\n/g, " ");
    //remove extra white space
    const data3 = data2.replace(/\s+/g, " ");
    //write to result.txt
    await fs.promises.writeFile("contentYoutube.txt", data3);
    return data3;
    // await browser.close();
  } catch (error) {
    console.error("Error fetching URL:", error);
    return "Không thể lấy nội dung từ link này.";
  }
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
          // If the error is due to rate limit, retry
          retryCount++;
          console.warn(
            `Retry attempt ${retryCount}: Waiting before retrying due to rate limit...`
          );
          await delay(2000 * retryCount); // Increase delay for each retry
        } else {
          throw error; // Throw error if it's not a rate-limiting issue
        }
      }
    }
    throw new Error("Max retry attempts reached. Please try again later.");
  } catch (error) {
    console.error("Error generating content:", error);
    // You can return the error message to the frontend here
    return `Error: ${error.message}`; // Or customize this error message as needed
  }
}

async function generateStyleFromExistingContent() {
  const listContentForTraining = fs.readFileSync(
    "list_content_for_training.txt",
    "utf8"
  );
  //split content by line
  const listContent = listContentForTraining.split("\n");
  const style = listContent?.map((item) => `<doc>${item}</doc>`)?.join("\n");
  const style_prompt = `
    - Bạn là một chuyên gia phân tích văn học, hãy xem xét kỹ lưỡng và phân tích sâu sắc phong cách viết của các đoạn văn được cung cấp.
    
    - Các đoạn văn này đều được viết bởi cùng một tác giả.
    
    ### HƯỚNG DẪN
    Xác định và liệt kê các yếu tố chính của phong cách viết, bao gồm:
    - Từ vựng và ngôn ngữ đặc trưng
    - Cấu trúc câu và đoạn văn
    - Giọng điệu và cách thể hiện
    - Sử dụng các biện pháp tu từ và biểu tượng (nếu có)
    
    ### NHIỆM VỤ
    - Nhiệm vụ của bạn là cung cấp một phân tích chuyên sâu về phong cách viết được sử dụng trong các đoạn văn được cung cấp.
    - Phân tích của bạn nên đi sâu vào những sắc thái trong kỹ năng của tác giả, làm nổi bật những đặc điểm độc đáo xác định phong cách viết của họ.
    
    ### ĐỘ DÀI
    Nhắm đến một phân tích chi tiết bao gồm đầy đủ các yếu tố được chỉ định.
    
    ### KẾT QUẢ
    Đánh giá của bạn nên cung cấp một sự hiểu biết toàn diện về cách tác giả xây dựng văn phong, làm sáng tỏ những phức tạp trong kỹ thuật viết của họ.
    
    ---------------
    Các đoạn văn cần được trích xuất ra phong cách viết:
    ${style}
    `;
  const req = `${style_prompt}`;
  const resp = await generativeModel.generateContent(req);
  let text = resp?.response?.candidates[0]?.content?.parts[0]?.text;
  console.log("style after generate using instruction", text);
  //write to file
  fs.writeFile("style.txt", text, (err) => {
    if (err) throw err;
    console.log("The file has been saved!");
  });
  return text;
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
${style}`;

  //viết lại dựa trên các trích đoạn và phong cách viết được cung cấp
  const req = `${instruction}`;
  await delay(10 * 1000);
  const resp = await generativeModel.generateContent(req);
  let text = resp?.response?.candidates[0]?.content?.parts[0]?.text;
  console.log("content after generate using instruction", text);
  //write to file
  fs.writeFile("output.txt", text, (err) => {
    if (err) throw err;
    console.log("The file has been saved!");
  });
  return text;
}

async function generateContentUsingConnectingWords(output_recursive_prompt) {
  // const connecting_words = `
  //   Với,  Đây được coi, Dự kiến, Ngoài ra, Thế nhưng đó chỉ, Theo tìm hiểu, Theo,  Đặc biệt hơn, Vậy lý do, Nguyên nhân, Không chỉ là, Từ những, Điều đặc biệt là, Với những, Cụ thể, Thay vì, Tuy nhiên, Thậm chí, Trong đó, Vì vậy, Cụ thể, Hiện tại, Đó chính là, Liệu rằng, Thứ nhất, Thứ hai, Như vậy, Điều này giúp, Nhưng mà, Do đó, Bởi vì, Do lúc này, Việc đầu tiên, Nên là, Không chỉ, Nếu là, Để ngăn ngừa, Đặc biệt, Bạn cần lưu ý, Cả nhà có thể, Các bạn có thể, Hiện nay, Với, Thậm chí, Trong đó, Vì vậy, Cụ thể, Hiện tại, Đó chính là, Nguyên nhân, Nếu như, Trong những, Chính vì vậy, Đây là, Tuy nhiên, Ngoài các, Thứ nhất, Thứ hai, Liệu rằng, Như vậy, Điều này giúp, Trong khi đó, Không chỉ có, Trong trường hợp, Vậy, Tại sao, Trong khi, Nguyên nhân, Rõ ràng, Bằng cách này, Vậy tại sao, Hầu hết, Trong khi đó, Điều này đã, Nguyên nhân này, Thường thì, Theo đông y, Có lẽ, Và chính, Vì vậy, Những loại thảo dược này, Đây là, Những thành phần này
  //   `;
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

  const req2 = `${connecting_word_prompt}`;
  await delay(10 * 1000);
  const resp2 = await generativeModel.generateContent(req2);
  let text2 = resp2?.response?.candidates[0]?.content?.parts[0]?.text;
  console.log("Content generated using connecting words", text2);
  //write to file
  fs.writeFile("final.txt", text2, (err) => {
    if (err) throw err;
    console.log("The file has been saved!");
  });
  return text2;
}

// generateContent();

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
      await delay(10 * 1000);
    } catch (error) {
      // Handle error and send back a message to the frontend
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

app.listen(5080, () => {
  console.log("Server is running on http://localhost:5080");
});
