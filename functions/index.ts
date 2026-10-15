import { Ai } from '@cloudflare/ai';

interface Env {
  AI: any;
  // セッション管理用にKVやD1を使う場合はここにバインドを追加します
}

// 3人のキャラクターのベース設定
const CHARACTERS = [
  {
    id: "butler",
    name: "セバスチャン（執事）",
    title: "厳格な執事",
    basePrompt: "You are Sebastian, the strict butler. You are polite, formal, but easily offended. Respond ONLY in natural Japanese. Keep your answers under 3 sentences."
  },
  {
    id: "painter",
    name: "エレナ（画家）",
    title: "情熱的な画家",
    basePrompt: "You are Elena, a passionate painter. You are emotional and defensive. Respond ONLY in natural Japanese. Keep your answers under 3 sentences."
  },
  {
    id: "detective",
    name: "レオン（自称探偵）",
    title: "キザな自称探偵",
    basePrompt: "You are Leon, a arrogant self-proclaimed detective. You speak coolly. Respond ONLY in natural Japanese. Keep your answers under 3 sentences."
  }
];

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // CORSヘッダー（フロントエンドから呼べるようにする）
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    try {
      const body = await request.json() as { 
        action: string, 
        targetChar?: string, 
        message?: string,
        gameState?: any 
      };

      const ai = new Ai(env.AI);

      // --- アクション1: ゲームの初期化（犯人をランダムに決める） ---
      if (body.action === "init") {
        const culpritIndex = Math.floor(Math.random() * CHARACTERS.length);
        const culpritId = CHARACTERS[culpritIndex].id;

        // クライアント側に返す初期状態（※実際の本格運用では犯人IDはD1やKVに隠すべきですが、まずはシンプルにいきます）
        const gameState = {
          culpritId: culpritId,
          // 各キャラの秘密や役割
          suspects: CHARACTERS.map((char, index) => ({
            id: char.id,
            name: char.name,
            title: char.title,
            isCulprit: index === culpritIndex
          }))
        };

        return new Response(JSON.stringify({ 
          success: true, 
          message: "ゲームが開始されました。犯人はランダムに決定しました。",
          // デバッグ用に犯人を教えちゃいますが、後で隠せます笑
          debugCulprit: culpritId, 
          gameState 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // --- アクション2: キャラクターへの質問・取調べ ---
      if (body.action === "chat") {
        const { targetChar, message, gameState } = body;
        const target = CHARACTERS.find(c => c.id === targetChar);

        if (!target) {
          return new Response(JSON.stringify({ error: "Character not found" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const isCulprit = gameState.culpritId === targetChar;

        // キャラクターごとの動的プロンプトの組み立て
        let roleInstruction = "";
        if (isCulprit) {
          roleInstruction = `
          CRITICAL ROLE INSTRUCTION: You are the CULPRIT who stole the diamond! 
          You must LIE about your alibi to protect yourself. 
          However, if the user asks tricky questions about specific details (like time, weather, or location), show slight panic and accidentally start to contradict yourself.
          `;
        } else {
          roleInstruction = `
          ROLE INSTRUCTION: You are INNOCENT of stealing the diamond. 
          You have an alibi, but you might be hiding an embarrassing secret (like napping or sneaking out to eat snacks), which makes you nervous when questioned.
          `;
        }

        const systemPrompt = `${target.basePrompt}\n${roleInstruction}`;

        // Workers AI (Llama 3.1) の呼び出し
        const aiResponse = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message }
          ]
        });

        return new Response(JSON.stringify({ 
          success: true, 
          reply: aiResponse.response 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  },
};