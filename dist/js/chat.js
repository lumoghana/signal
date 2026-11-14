import { esc, icon } from './ui.js';
import { getLuxAnswer, executeLuxPlan, luxQuestionContext, validateLuxPlan } from './lux-brain.js';
import { isFinancialAnswerStale, installPreparedChatAction } from './chat-action-model.js';
export { getMoneyAnswer, getSpendingPeriod } from './money-answers.js';

// Replies belong to the conversation, rather than to a particular render.
const activeReplies = new WeakMap();
const LESSONS = [
  { id: 'expected', title: 'Money on the way', question: 'Kofi owes you GH₵100 and says he will pay tomorrow. What can you count as available today?', options: ['The GH₵100, because he promised', 'Only the money you have received', 'Half of the GH₵100'], correct: 1, explanation: 'A promise is expected money. It becomes available when it actually arrives. That keeps your plan grounded in money you can use.' },
  { id: 'boxes', title: 'Moving, or spending?', question: 'You move GH₵20 from a GH₵100 spending balance into your Money Box. How much money do you still hold in total?', options: ['GH₵80', 'GH₵100', 'GH₵120'], correct: 1, explanation: 'You still hold GH₵100: GH₵80 for spending and GH₵20 in savings. Moving money between your own accounts changes its purpose, not your total.' },
  { id: 'budget', title: 'Give it a job', question: 'You plan GH₵200 for food. What has happened to that money?', options: ['It has already been spent', 'It has been reserved in your plan', 'It has moved to a new bank account'], correct: 1, explanation: 'A budget gives your money a job. The money stays in your spending account until you pay for something. Lumo keeps that commitment in view.' },
];
const starters = [
  { question: 'Can I afford lunch?', label: 'Can I afford lunch?', symbol: '🍲' },
  { question: 'Where did my money go?', label: 'Where did it go?', symbol: '👀' },
  { question: 'My allowance is late', label: 'Allowance is late', symbol: '🫠' },
  { question: 'Help me save for a goal', label: 'Let’s save for something', symbol: '✨' },
];
const id = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const frames = callback => typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : setTimeout(callback, 0);
const cancelFrame = handle => typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(handle) : clearTimeout(handle);
const plainMessages = value => Array.isArray(value) ? value.filter(message => message && ['user', 'assistant'].includes(message.role)) : [];

function chatState(ctx) {
  if (!ctx.draft.chat || typeof ctx.draft.chat !== 'object' || Array.isArray(ctx.draft.chat)) ctx.draft.chat = {};
  const chat = ctx.draft.chat;
  chat.messages = plainMessages(chat.messages);
  chat.input = typeof chat.input === 'string' ? chat.input.slice(0, 400) : '';
  chat.lessonIndex = Number.isSafeInteger(chat.lessonIndex) && chat.lessonIndex >= 0 ? chat.lessonIndex : 0;
  chat.pending = chat.pending === true;
  return chat;
}

/** A reload finishes a question once, using the current recorded money and prior context. */
export function recoverInterruptedChat(state, storedChat) {
  const source = storedChat && typeof storedChat === 'object' ? storedChat : {};
  const chat = { ...source, messages: [...plainMessages(source.messages)], input: typeof source.input === 'string' ? source.input.slice(0, 400) : '', lessonIndex: Number.isSafeInteger(source.lessonIndex) && source.lessonIndex >= 0 ? source.lessonIndex : 0, pending: false };
  if (!source.pending) return chat;
  const index = chat.messages.findLastIndex(message => message.role === 'user' && typeof message.text === 'string' && message.text.trim());
  if (index < 0 || chat.messages.slice(index + 1).some(message => message.role === 'assistant' && message.kind !== 'lesson')) return chat;
  const user = chat.messages[index];
  chat.messages.push({ id: `a-recovered-${user.id || index}`, role: 'assistant', ...getLuxAnswer(state, user.text, { messages: chat.messages.slice(0, index) }) });
  chat.scrollToEnd = true;
  return chat;
}

const speaker = () => '<div class="chat-speaker"><img class="chat-lux-avatar" src="/assets/lux-chat-2d.webp" width="40" height="40" alt="" aria-hidden="true"><span>Lux</span></div>';
function actionButtons(actions = [], messageId, stale = false) {
  const available = Array.isArray(actions) ? actions.map((action, index) => ({ action, index })).filter(({ action }) => action && typeof action === 'object' && !(stale && action.prepare)) : [];
  if (!available.length) return '';
  const control = ({ action, index }, primary = false) => `<button type="button"${primary ? ' class="chat-action-primary"' : ''} data-chat-route="${esc(messageId)}:${index}">${esc(action.label)} ${icon('arrow', 15)}</button>`;
  return `<div class="chat-actions">${control(available[0], true)}${available.length > 1 ? `<details class="chat-more-actions"><summary>More options ${icon('chevron', 14)}</summary>${available.slice(1).map(item => control(item)).join('')}</details>` : ''}</div>`;
}
function messageHTML(message, state) {
  if (message.role === 'user') return `<div class="chat-message user" data-message-id="${esc(message.id)}"><p>${esc(message.text)}</p></div>`;
  if (message.kind === 'lesson') {
    const lesson = LESSONS.find(lesson => lesson.id === message.lessonId) || LESSONS[0], answered = Number.isInteger(message.answer);
    return `<article class="chat-message assistant chat-lesson" data-message-id="${esc(message.id)}">${speaker()}<div class="chat-reply-body"><p class="chat-lesson-kicker">A little money know-how</p><h2>${esc(lesson.title)}</h2><p>${esc(lesson.question)}</p><div class="lesson-options">${lesson.options.map((option, index) => `<button type="button" class="lesson-option${answered && index === lesson.correct ? ' correct' : ''}${message.answer === index ? ' selected' : ''}" data-chat-answer="${esc(message.id)}:${index}"${answered ? ' disabled' : ''}>${esc(option)}${answered && index === lesson.correct ? icon('check', 18) : ''}</button>`).join('')}</div>${answered ? `<div class="lesson-result" role="status"><strong>${message.answer === lesson.correct ? 'You’ve got it.' : 'Here’s the useful bit.'}</strong><p>${esc(lesson.explanation)}</p></div><button type="button" class="chat-next-lesson" data-chat-action="learn">Keep learning ${icon('arrow', 15)}</button>` : ''}</div></article>`;
  }
  const stale = isFinancialAnswerStale(state, message), checked = message.checkedAt && Number.isFinite(Date.parse(message.checkedAt)) ? new Date(message.checkedAt).toLocaleString('en-GH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' }) : '';
  const checkAgain = message.sourceQuestion || message.context?.canonicalQuestion ? `<button type="button" data-chat-recheck="${esc(message.id)}">${stale ? 'Recheck with current money' : 'Check again'}</button>` : '';
  const freshness = message.context && !['greeting', 'thanks', 'identity', 'clarify', 'approval'].includes(message.context.topic) ? stale ? `<div class="chat-freshness is-stale"><span>Your money has changed. This earlier answer needs a recheck.</span>${checkAgain}</div>` : `<details class="chat-freshness"><summary>${esc(`Checked ${checked || 'against recorded money'}`)} ${icon('chevron', 13)}</summary>${checkAgain}</details>` : '';
  return `<article class="chat-message assistant" data-message-id="${esc(message.id)}">${speaker()}<div class="chat-reply-body">${message.title ? `<h2>${esc(message.title)}</h2>` : ''}${(Array.isArray(message.paragraphs) ? message.paragraphs : []).map(paragraph => `<p>${esc(paragraph)}</p>`).join('')}${Array.isArray(message.stats) && message.stats.length ? `<div class="chat-response-card">${message.stats.filter(stat => stat && typeof stat === 'object').map(stat => `<div class="chat-stat"><span>${esc(stat.label)}</span><strong>${esc(stat.value)}</strong></div>`).join('')}</div>` : ''}${Array.isArray(message.basis) && message.basis.length ? `<details class="chat-basis"><summary>How Lux worked this out ${icon('chevron', 13)}</summary>${message.basis.map(line => `<p>${esc(line)}</p>`).join('')}</details>` : ''}${freshness}${actionButtons(message.actions, message.id, stale)}</div></article>`;
}

export function renderChat(ctx) {
  const chat = chatState(ctx), hasMessages = chat.messages.length > 0;
  const name = String(ctx.state.profile?.name || '').trim().split(/\s+/)[0] || 'there';
  const last = chat.messages.at(-1), followUps = !chat.pending && last?.role === 'assistant' && last.kind !== 'lesson' && Array.isArray(last.followUps) ? last.followUps.slice(0, 2).filter(value => typeof value === 'string') : [];
  return `<section class="chat-page${hasMessages ? ' has-messages' : ' is-new-conversation'}" aria-label="Ask Lux" data-chat-view>
    <header class="chat-topbar"><button type="button" class="chat-home" data-chat-action="home" aria-label="Home">${icon('home', 18)}<span>Home</span></button><div class="chat-brand"><strong>Ask Lux</strong><small>Your Lumo buddy</small></div><button type="button" class="chat-options" data-chat-action="options" aria-label="Conversation options">${icon('more', 23)}</button></header>
    <div class="chat-thread" id="chat-thread" role="log" aria-label="Money conversation" aria-live="polite" aria-relevant="additions text">
      ${hasMessages ? chat.messages.map(message => messageHTML(message, ctx.state)).join('') : `<div class="chat-intro"><div class="chat-hero-lux"><img src="/assets/lux-chat-2d.webp" width="148" height="148" alt="Lux, your Lumo money buddy"></div><h1>Hey ${esc(name)}.<br>Let’s talk money.</h1><p>What’s on your mind?</p><div class="chat-suggestions">${starters.map(starter => `<button type="button" data-chat-question="${esc(starter.question)}"><span aria-hidden="true">${starter.symbol}</span><span>${esc(starter.label)}</span>${icon('arrow', 14)}</button>`).join('')}</div><button type="button" class="chat-learn" data-chat-action="learn">${icon('spark', 17)} Learn with Lux</button></div>`}
      ${chat.pending ? `<div class="chat-message assistant chat-typing" role="status">${speaker()}<div class="chat-typing-body"><span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>Let’s work this out…</span></div></div>` : ''}<div id="chat-end" aria-hidden="true"></div>
    </div>
    <footer class="chat-composer-wrap">${hasMessages && !chat.pending ? `<div class="chat-quick-actions">${followUps.map(question => `<button type="button" data-chat-question="${esc(question)}">${esc(question)}</button>`).join('')}<button type="button" data-chat-action="learn">${icon('spark', 15)} Learn with Lux</button></div>` : ''}<form id="chat-form" class="chat-composer" autocomplete="off"><label class="sr-only" for="chat-input">Ask about your money</label><textarea id="chat-input" name="question" rows="1" maxlength="400" enterkeyhint="send" placeholder="What’s the money question?" aria-label="Ask about your money">${esc(chat.input)}</textarea><button type="submit" class="chat-send" aria-label="Send question"${chat.pending || !chat.input.trim() ? ' disabled' : ''}>${icon('arrow', 21)}</button></form><p class="chat-disclaimer">${ctx.connected ? 'Based on your recorded money. You approve every move.' : 'Sample money · Calculations from these records.'}</p>${!hasMessages ? `<div class="chat-swipe-hint" aria-label="Swipe right to return to your app"><span aria-hidden="true">${icon('back', 12)}<i></i><i class="active"></i></span><span>Swipe right to your app</span></div>` : ''}</footer>
  </section>`;
}

function ask(ctx, question) {
  const chat = chatState(ctx), clean = String(question || '').trim().slice(0, 400);
  if (!clean || chat.pending) return false;
  const token = id('message'), run = { token, timer: null, controller: new AbortController() }, history = [...chat.messages];
  const owner = ctx.shared?.user?.id || '', epoch = ctx.shared?.authVersion;
  const validReply = () => ctx.draft.chat === chat && activeReplies.get(chat) === run && (ctx.shared?.user?.id || '') === owner && ctx.shared?.authVersion === epoch;
  chat.messages.push({ id: `u-${token}`, role: 'user', text: clean });
  chat.input = ''; chat.pending = true; chat.scrollToEnd = true; chat.followTail = true;
  activeReplies.set(chat, run); ctx.saveDraft?.(); ctx.refresh();
  run.timer = setTimeout(async () => {
    if (!validReply()) return;
    let answer;
    if (ctx.connected && typeof ctx.shared?.askLux === 'function') {
      const context = luxQuestionContext(history);
      let result;
      try { result = await ctx.shared.askLux(clean, context, { signal: run.controller.signal }); }
      catch { result = { ok: false, message: 'I couldn’t reach Lux. Try again when you’re connected.' }; }
      if (!validReply()) return;
      if (result.ok && result.answer) {
        const plan = result.plan && validateLuxPlan(result.plan, clean, context);
        answer = plan ? executeLuxPlan(ctx.state, clean, plan, { messages: history, mode: result.mode }) : result.answer;
        chat.mode = result.mode; chat.reason = result.reason;
      } else {
        answer = { title: 'Let’s try that again.', paragraphs: [result.message || 'I couldn’t refresh your money. Try again before relying on a number.'], actions: [], followUps: [clean], context: { topic: 'clarify' } };
      }
    } else {
      answer = getLuxAnswer(ctx.state, clean, { messages: history });
      chat.mode = 'local';
    }
    if (!validReply()) return;
    chat.messages.push({ id: `a-${token}`, role: 'assistant', ...answer });
    // Bound private session storage and provider context independently.
    while (chat.messages.length > 80) chat.messages.shift();
    chat.pending = false; activeReplies.delete(chat);
    if (chat.followTail !== false) chat.scrollToEnd = true;
    ctx.saveDraft?.(); if (ctx.route?.section === 'chat') ctx.refresh();
  }, reducedMotion() ? 0 : 120);
  return true;
}
function addLesson(ctx) {
  const chat = chatState(ctx); if (chat.pending) return;
  const lesson = LESSONS[chat.lessonIndex % LESSONS.length];
  chat.lessonIndex += 1; chat.messages.push({ id: id('lesson'), role: 'assistant', kind: 'lesson', lessonId: lesson.id });
  chat.scrollToEnd = true; ctx.saveDraft?.(); ctx.refresh();
}
function splitReference(value) {
  const at = String(value).lastIndexOf(':');
  return [String(value).slice(0, at), Number(String(value).slice(at + 1))];
}

export function bindChat(ctx) {
  const chat = chatState(ctx);
  if (chat.pending && !activeReplies.has(chat)) { ctx.draft.chat = recoverInterruptedChat(ctx.state, chat); ctx.saveDraft?.(); ctx.refresh(); return () => {}; }
  if (ctx.draft.chatPendingQuestion && !chat.pending) { const question = ctx.draft.chatPendingQuestion; delete ctx.draft.chatPendingQuestion; ask(ctx, question); return () => {}; }
  const root = ctx.$('[data-chat-view]'); if (!root) return () => {};
  let alive = true, frame = null, composing = false;
  const valid = () => alive && root.isConnected !== false && ctx.draft.chat === chat && ctx.route?.section === 'chat';
  const listeners = [], listen = (element, name, handler, options) => { if (!element) return; element.addEventListener(name, handler, options); listeners.push(() => element.removeEventListener(name, handler, options)); };
  const input = root.querySelector('#chat-input'), send = root.querySelector('.chat-send'), thread = root.querySelector('#chat-thread');
  const recordScroll = () => { if (!valid() || !thread) return; chat.scrollTop = thread.scrollTop; chat.followTail = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 56; };
  const restore = () => {
    if (frame !== null) cancelFrame(frame);
    frame = frames(() => { frame = null; if (!valid() || !thread) return;
      const top = chat.scrollToEnd || chat.scrollTop === undefined ? thread.scrollHeight : chat.scrollTop;
      thread.scrollTo?.({ top, behavior: 'auto' }); if (!thread.scrollTo) thread.scrollTop = top;
      chat.scrollToEnd = false; recordScroll();
    });
  };
  const autoSize = () => {
    if (!input) return; input.style.height = 'auto'; input.style.height = `${Math.min(124, Math.max(46, input.scrollHeight || 46))}px`;
    input.style.overflowY = input.scrollHeight > 124 ? 'auto' : 'hidden';
    if (send) send.disabled = chat.pending || !input.value.trim();
  };
  listen(input, 'input', () => { if (!valid()) return; chat.input = input.value.slice(0, 400); autoSize(); ctx.saveDraft?.(); if (chat.followTail !== false && thread) thread.scrollTop = thread.scrollHeight; });
  listen(input, 'compositionstart', () => { composing = true; }); listen(input, 'compositionend', () => { composing = false; });
  listen(input, 'keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !composing) { event.preventDefault(); if (valid()) ask(ctx, input.value); } });
  listen(root.querySelector('#chat-form'), 'submit', event => { event.preventDefault(); if (valid()) ask(ctx, input?.value); });
  listen(thread, 'scroll', recordScroll, { passive: true });
  const click = event => {
    const button = event.target?.closest?.('button'); if (!valid() || !button || button.disabled) return;
    if (button.dataset.chatQuestion) { ask(ctx, button.dataset.chatQuestion); return; }
    if (button.dataset.chatRecheck) { const message = chat.messages.find(message => message.id === button.dataset.chatRecheck); if (message) ask(ctx, message.sourceQuestion || message.context?.canonicalQuestion); return; }
    if (button.dataset.chatRoute) {
      const [messageId, index] = splitReference(button.dataset.chatRoute), message = chat.messages.find(message => message.id === messageId), action = message?.actions?.[index], route = action?.route;
      if (action?.prepare) { if (isFinancialAnswerStale(ctx.state, message)) ask(ctx, message.sourceQuestion || message.context?.canonicalQuestion); else installPreparedChatAction(ctx, action); return; }
      if (route) ctx.go(route); return;
    }
    if (button.dataset.chatAnswer) {
      const [messageId, answer] = splitReference(button.dataset.chatAnswer), message = chat.messages.find(message => message.id === messageId), lesson = LESSONS.find(lesson => lesson.id === message?.lessonId);
      if (!message || !lesson || Number.isInteger(message.answer) || !Number.isInteger(answer) || answer < 0 || answer >= lesson.options.length) return;
      message.answer = answer; chat.scrollToEnd = true; ctx.saveDraft?.(); ctx.refresh(); return;
    }
    switch (button.dataset.chatAction) {
      case 'home': ctx.go({ section: 'home', page: 'home' }, { root: true }); break;
      case 'learn': ctx.go({section:'learn',page:'money-iq',returnTo:{section:'chat',page:'home',returnTo:ctx.route.returnTo||{section:'home',page:'home'}}}); break;
      case 'lesson': case 'next-lesson': addLesson(ctx); break;
      case 'options': ctx.sheet(`<div class="chat-options-sheet"><p class="eyebrow">Ask Lux</p><h2>A fresh start?</h2><p><strong>Kept for this tab’s session.</strong> Refreshing keeps the conversation, but closing the tab can remove it. It is not synced to other devices. Clearing it leaves your money exactly as it is.</p><p class="chat-demo-detail">${ctx.connected ? chat.mode === 'ai' ? 'AI helps Lux understand your questions. Only your question and recent question context go to the AI provider. Lumo calculates the figures from your account records. The provider does not receive your balances or transaction history.' : chat.mode === 'recorded' ? 'Live AI is unavailable right now. Lux is using Lumo’s recorded-money tools. Questions have a narrower range until the AI connection is available.' : 'Connected Ask Lux checks your account records. When available, AI interprets your question; Lumo calculates the figures. AI receives questions and recent question context, not your balances or transaction history.' : 'This sample uses local recorded-money tools. No live AI connection is used.'} Chat can open a draft, but payments still require review, Pause when applicable, and your approval. Don’t share a PIN, password or Ghana Card number here.</p><button type="button" class="button" data-chat-clear>Clear conversation</button><button type="button" class="button secondary" data-chat-keep>Keep chatting</button></div>`, sheet => {
        const sameConversation = () => valid() && sheet.isConnected !== false;
        listen(sheet.querySelector('[data-chat-clear]'), 'click', () => {
          if (!sameConversation()) return;
          const run = activeReplies.get(chat); if (run) { clearTimeout(run.timer); run.controller?.abort(); } activeReplies.delete(chat); chat.pending = false;
          ctx.draft.chat = { messages: [], input: '', lessonIndex: chat.lessonIndex, pending: false }; ctx.closeSheet(); ctx.saveDraft?.(); ctx.refresh();
        });
        listen(sheet.querySelector('[data-chat-keep]'), 'click', () => { if (sameConversation()) ctx.closeSheet(); });
      }); break;
    }
  };
  listen(root, 'click', click);
  const viewport = globalThis.visualViewport;
  const viewportSize = () => {
    if (!valid() || !root.getBoundingClientRect) return;
    const viewportHeight = viewport?.height || globalThis.innerHeight || root.parentElement?.clientHeight;
    const available = Math.min(root.parentElement?.clientHeight || viewportHeight, viewportHeight - Math.max(0, root.getBoundingClientRect().top - (viewport?.offsetTop || 0)));
    if (Number.isFinite(available) && available > 0) root.style.setProperty('--chat-viewport-height', `${available}px`);
    if (chat.followTail !== false) restore();
  };
  listen(viewport, 'resize', viewportSize, { passive: true }); listen(viewport, 'scroll', viewportSize, { passive: true });
  // Connectivity banners can change the available height without resizing the viewport.
  const layoutObserver = typeof globalThis.ResizeObserver === 'function' && root.parentElement ? new globalThis.ResizeObserver(viewportSize) : null;
  layoutObserver?.observe(root.parentElement);
  autoSize(); restore(); viewportSize();
  return () => { alive = false; layoutObserver?.disconnect(); if (frame !== null) cancelFrame(frame); listeners.forEach(remove => remove()); root.style.removeProperty('--chat-viewport-height'); ctx.saveDraft?.(); };
}
