const { App } = require("@slack/bolt");
const axios = require("axios");

/*
 * Slack BOT用のAppを生成する。
 */
const app = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  token: process.env.SLACK_BOT_TOKEN,
});

/*
 * chat-gptに会話文章を送り、それに続くメッセージを取得します。
 * @param {list<string>} messages 成形された会話文
 * @return {string} chat-gptから得られたメッセージ
 */
const postChat = async (messages) => {
  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: process.env.MODEL_TYPE,
      messages: messages,
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CHAT_GPT_TOKEN}`,
      },
    }
  );

  // chat-gptから何も返ってこなかった。基本的には起きないはず。
  if (!response.data) return "No response from OpenAI API";

  // messageの内容だけ取り出す。
  return response.data.choices[0].message.content;
};

/*
 * BOTがメンションされことを検知して応答を生成します。
 * メンションされたメッセージのスレッドに応答を返します。
 * スレッド内での会話履歴に基づいて応答します。スレッド外の会話は考慮しません。
 */
app.event("app_mention", async ({ event, context, client, say }) => {
  const channelId = event.channel;
  const post_conversations = await client.conversations.replies({
    channel: channelId,
    ts: event.thread_ts || event.ts,
  });

  if (!post_conversations.messages) {
    // 応答を返すべきスレッドが見つからなかったのでダイレクトメッセージでエラーを報告して終了します。
    await say("Error! Threadが見つかりません。");
    return;
  }

  // chat-gptが取り扱える対話の形式に変換します。
  // https://platform.openai.com/docs/api-reference/chat/create
  // 会話に不要なメンション表記は取り除いておくことにします。
  const threadMessages = post_conversations.messages.map((message) => {
    return {
      role: message.user === process.env.BOT_USER_ID ? "assistant" : "user",
      content: (message.text || "").replace(
        `<@${process.env.BOT_USER_ID}>`,
        ""
      ),
    };
  });

  const gptAnswerText = await postChat(threadMessages);

  // chat-gptの応答を該当スレッドに流します。
  await say({
    text: gptAnswerText,
    thread_ts: event.ts,
  });
});

// Start app
(async () => {
  await app.start(process.env.PORT || 3000);
})();
