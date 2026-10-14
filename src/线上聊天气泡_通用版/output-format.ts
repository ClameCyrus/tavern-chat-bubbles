import { z } from 'zod';

export const FIXED_OUTPUT_STRUCTURE = `【固定格式】
[类型|发送方|接收方|内容|附加|时间]
- 附加与时间可省略：可为 [类型|发送方|接收方|内容|时间] 或 [类型|发送方|接收方|内容]。
- 每条聊天条目必须顶格独立成行，行首禁止加空格或缩进。
- 任一字段内部禁止出现竖线与方括号。
- 禁止包裹在代码块中。`;

export const DEFAULT_OUTPUT_RULES = `当剧情中角色通过手机、社交软件、短信、群聊等线上方式交流时，聊天内容必须以固定格式逐条输出，每行一条，行与行之间用空行隔开。非线上对话场景不得使用本格式，保持正常正文叙述。聊天块前后可以正常穿插中文叙事描写。

本格式适用于剧情里任何两个人（或一群人）之间的线上对话，包括：角色与{{user}}的私聊、{{char}}与NPC的私聊、NPC之间的私聊、多人参与的群聊、对某个角色手机屏幕的描写。若{{char}}是多人卡或世界观卡，{{char}}自身可以不是对话参与者，一律按实际说话的人填写发送方。角色名不限制语言。

【填写规则】
- 时间统一使用 24 小时制 HH:MM，如 23:14。
- 发送方写法：{{user}}一方写 {{user}}；其余一律写该角色的名字（与剧情中的称呼一致）。
- 接收方写法：发给{{user}}时写 {{user}}；发给其他角色写对方名字；群聊写固定群名。
- text 类型的语言风格遵循角色卡自身设定（如角色卡要求双语台词，则照旧成对写入内容字段）。

【类型语义】
- text：内容为消息文本；附加可写状态词（已读/未读/送达失败），无则留空。
- voice：内容为语音的听觉转写文字；附加为时长，如 12"。
- transfer：内容为金额数字，如 500.00；附加为转账备注。
- redpacket：内容为红包祝福语；附加为状态（已领取/待领取）。
- image：内容为一句中文图片描述；附加为一到三个英文取图关键词，逗号分隔，如 bar,neon,night。
- sticker：内容为一个表情包名称、表情符号或颜文字；附加可写贴纸吐槽文字。若存在表情包名录，优先从名录中挑选名称填入内容字段。
- call：内容为通话结果，如 通话时长 3:24 或 未接听；附加写 语音通话 或 视频通话。
- location：内容为地点名；附加为所在区域或街区。
- file：内容为文件名；附加为文件大小或说明。
- system：内容为系统提示，如 某人 撤回了一条消息；接收方字段留空。
- typing：内容与附加留空，表示对方正在输入，用于制造停顿与悬念。

【输出示例】（名字仅为格式演示，实际输出使用剧情中的真实角色名）

[text|林恩|{{user}}|你在哪里？楼下风很大。|已读|23:14]

[sticker|{{user}}|林恩|🙄|翻个大白眼|23:15]

[typing|林恩|{{user}}|23:16]

[text|Robin|Mika|明天老地方，别迟到。|已读|21:07]

[system|Robin||Robin 邀请 Mika 加入了群聊|22:03]

[redpacket|Robin|周末小队|恭贺乔迁！|待领取|22:04]

[image|Mika|周末小队|凌晨三点的吧台只剩霓虹还亮着|bar,neon,night|22:07]`;

const Rules = z.string().nullable();
const SavedRules = z.record(z.string(), Rules).catch({});
const STORAGE_KEY = 'chat_bubble_output_rules';

export function normalizeOutputRules(input: unknown): string | null {
  const rules = Rules.parse(input);
  if (rules === null) return null;
  const normalized = rules.replace(/\r\n?/g, '\n').trim();
  return normalized === DEFAULT_OUTPUT_RULES ? null : normalized;
}

export function buildOutputFormat(input: string | null = null): string {
  const rules = normalizeOutputRules(input) ?? DEFAULT_OUTPUT_RULES;
  return `<party_chat_format>\n# 线上聊天输出格式\n\n${FIXED_OUTPUT_STRUCTURE}\n\n${rules}\n</party_chat_format>`;
}

export function loadOutputRules(book: string): { rules: string | null; managed: boolean } {
  const saved = SavedRules.parse(getVariables({ type: 'script' })[STORAGE_KEY]);
  const managed = Object.hasOwn(saved, book);
  return { rules: managed ? normalizeOutputRules(saved[book]) : null, managed };
}

export function saveOutputRules(book: string, input: string | null): void {
  const rules = normalizeOutputRules(input);
  updateVariablesWith(
    variables => {
      const saved = SavedRules.parse(variables[STORAGE_KEY]);
      return { ...variables, [STORAGE_KEY]: { ...saved, [book]: rules } };
    },
    { type: 'script' },
  );
}

export function importOutputRules(input: unknown, current: string): string {
  if (!input || typeof input !== 'object' || !Object.hasOwn(input, 'output_format')) return current;
  const format = z.object({ rules: Rules }).parse((input as Record<string, unknown>).output_format);
  return normalizeOutputRules(format.rules) ?? DEFAULT_OUTPUT_RULES;
}
