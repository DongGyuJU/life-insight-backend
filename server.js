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

// 💡 백엔드 라우터에 추가할 /expense-feedback 엔드포인트
// 💡 기존 fetch 스타일과 Fastify 환경에 맞게 완벽하게 수정한 엔드포인트
app.post('/expense-feedback', async (req, reply) => {
  try {
    const { expenseData } = req.body;

    if (!expenseData) {
      reply.status(400);
      return { error: "지출 데이터가 없습니다." };
    }

    // 다른 라우트들과 똑같이 fetch 방식으로 Groq API 호출!
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant', // 기존에 검증된 똑똑하고 빠른 모델 사용
        messages: [
          {
            role: "system",
            content: `너는 유저의 가계부를 진단하고 자산 관리를 조언해주는 냉철하고 위트 있는 금융 비서야.
유저가 이번 달 [총 지출 및 카테고리별 요약] 데이터를 주면, 그걸 기반으로 유저의 정신을 번쩍 들게 할 '뼈 때리는 한마디'나 '현실적인 조언'을 해줘야 해.

[반드시 지켜야 할 철칙]
1. 친근하게 존댓말을 쓰되, 약간 뼈를 때리는 반전 매력이나 위트가 있어야 해.
2. 절대로 다른 쓸데없는 말은 생략하고 진짜 본론만 '딱 한 줄(50자 내외)'로 출력해.
3. 제공받은 [유저의 실제 데이터]에 있는 카테고리 이름과 금액만 사용해. (절대 없는 내용을 지어내거나 거짓말하지 마)
4. 예시 형식: "[가장 많이 쓴 카테고리]에만 [금액]원이라니, [관련된 재치 있는 잔소리]"`
          },
          {
            role: "user",
            content: `내 이번 달 지출 데이터야: ${expenseData}`
          }
        ],
        temperature: 0.7,
      })
    });

    const data = await response.json();
    const aiResponse = data.choices[0].message.content.trim();

    // 프론트엔드가 바로 먹을 수 있게 { feedback: "잔소리" } 형태로 리턴
    return { feedback: aiResponse };

  } catch (error) {
    console.error("지출 분석 에러:", error);
    reply.status(500);
    return { error: "AI 분석 중 오류가 발생했습니다." };
  }
});

app.listen({ port: 3000, host: '0.0.0.0' });
console.log('app_dev server on port 3000');