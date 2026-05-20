require('dotenv').config();
const Fastify = require('fastify');

const app = Fastify();

app.get('/health', async () => {
  return { status: 'app_dev server running' };
});

app.post('/analyze', async (req, reply) => {
  const { text } = req.body;
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `You are a Korean life logging assistant. Analyze the text and return ONLY a JSON object. No explanation.

  Today: ${today}
  Text: "${text}"

  Return this exact JSON structure:
  {
    "categories": [],
    "sub_category": null,
    "amount": null,
    "appointment_date": null,
    "exercise_type": null,
    "exercise_minutes": null,
    "work_partner": null,
    "work_priority": "보통",
    "is_todo": 0,
    "due_date": null,
    "summary": null
  }

  categories(복수가능):
  - diary: 일기/감정/기분/하루기록
  - expense: 지출/소비/영수증/가계부
  - appointment: 순수 개인약속/데이트/친구모임/가족모임. 업무성 활동 절대 포함 안 함
  - work: 미팅/회의/마감/발표/보고/세미나/컨퍼런스/워크샵/면접/업무. 사람과 함께해도 업무성이면 work
  - exercise: 운동/헬스/달리기/수영/자전거
  - health: 건강/수면/식단/몸무게/병원
  - study: 공부/독서/강의/학습/시험
  - travel: 여행/방문/관광
  - other: 위에 해당 없음

  중요: "교수님 미팅", "팀장님 세미나", "발표 준비" → work
        "친구랑 저녁", "데이트", "가족 모임" → appointment

  SUB_CATEGORY rules:
  - diary → one of: 기쁨😊 설렘🥰 평온😌 피곤😪 슬픔😢 화남😠 불안😰
  - expense → one of: 카페 식사 쇼핑 교통 의료 구독 기타
  - appointment → one of: 데이트 친구 가족 업무 기타
  - work → one of: 미팅 발표 마감 D-day 보고 할일 기타
  - exercise → one of: 달리기 헬스 수영 자전거 요가 등산 줄넘기 기타
  - health → one of: 수면 식단 몸무게 병원 기타
  - study → one of: 독서 강의 시험 과제 기타
  - travel → one of: 국내 해외 당일치기 기타

  RULES:
  1. DATE: Convert relative dates ("다음주 토요일", "내일", "모레") to YYYY-MM-DD based on today(${today})
  2. WORK:
    - Has specific date → due_date = that date, is_todo = 0
    - No specific date → is_todo = 1, sub_category = "할일"
    - Extract work_partner (person's name/title like 팀장님, 교수님, 친구이름)
    - work_priority: 높음(urgent/important) 보통(normal) 낮음(minor)
  3. EXERCISE: Extract exercise_type and exercise_minutes
  4. EXPENSE: Extract amount as number only
  5. DIARY: No emotion field - use sub_category for emotion emoji
  6. SUMMARY: Max 10 Korean characters, no dates, noun form`;;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{role: 'user', content: prompt}],
      temperature: 0.1,
    })
  });

  const data = await response.json();
  const raw = data.choices[0].message.content;
  return JSON.parse(raw.replace(/```json|```/g, '').trim());
});

app.post('/report', async (req, reply) => {
  const { totalEntries, totalExpense, positiveCount, negativeCount, appointmentCount } = req.body;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{
        role: 'user',
        content: `다음 데이터로 한국어 2~3문장 생활 패턴 총평 작성. JSON 말고 순수 텍스트만.
- 총 기록: ${totalEntries}개
- 지출: ${totalExpense}원
- 긍정감정: ${positiveCount}회, 부정: ${negativeCount}회
- 약속: ${appointmentCount}개
따뜻한 톤으로.`
      }],
      temperature: 0.7,
    })
  });

  const data = await response.json();
  const raw = data.choices[0].message.content;
  return { summary: raw.trim() };
});
app.post('/analyze-image', async (req, reply) => {
  const { base64, today } = req.body;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${base64}`
            }
          },
          {
            type: 'text',
            text: `Today: ${today}. Analyze this image and extract all information. Return ONLY JSON, no explanation:
{
  "extracted_text": "모든 텍스트 내용",
  "categories": ["expense","diary","work","appointment","exercise","health","study","travel","other"],
  "sub_category": null,
  "amount": null,
  "appointment_date": null,
  "work_partner": null,
  "summary": "10자이내"
}

Rules:
- Receipt/영수증 → categories: ["expense"], extract amount as number, sub_category: 카페/식사/쇼핑/교통/의료/구독/기타
- Memo/노트 → analyze content and classify appropriately
- Multiple categories possible
- amount: number only (no currency symbol)
- summary: Korean, max 10 chars`
          }
        ]
      }],
      temperature: 0.1,
    })
  });

  const data = await response.json();
  const raw = data.choices[0].message.content;
  return JSON.parse(raw.replace(/```json|```/g, '').trim());
});

app.listen({ port: 3000, host: '0.0.0.0' });
console.log('app_dev server on port 3000');