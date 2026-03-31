import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const SILENCE_AUTO_SEND_MS = 3000;
const ACCEPT_FILES = 'image/*,.pdf,.docx,.xlsx,.xls,.csv,.txt';
const CHAT_STORAGE_KEY = 'bnk-mes-chat-messages';

function useSpeechRecognition() {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition =
      typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    setSupported(!!SpeechRecognition);
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'ko-KR';
    }
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  const startListening = useCallback((onResult, onAutoSend) => {
    if (!recognitionRef.current || !supported) return;
    const rec = recognitionRef.current;
    let lastFinal = '';

    const resetSilenceTimer = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        if (lastFinal.trim()) onAutoSend(lastFinal.trim());
        setListening(false);
        try {
          rec.stop();
        } catch {
          // ignore
        }
      }, SILENCE_AUTO_SEND_MS);
    };

    rec.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += transcript;
        else interim += transcript;
      }
      if (final) lastFinal = (lastFinal + final).trim();
      onResult(lastFinal + interim);
      resetSilenceTimer();
    };

    rec.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      setListening(false);
    };
    rec.onerror = () => setListening(false);

    setListening(true);
    rec.start();
    resetSilenceTimer();
  }, [supported]);

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setListening(false);
  }, []);

  return { supported, listening, startListening, stopListening };
}

function loadStoredMessages() {
  try {
    if (typeof window !== 'undefined') {
      const s = localStorage.getItem(CHAT_STORAGE_KEY);
      if (s) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch {
    // ignore
  }
  return [];
}

export default function ChatPanel() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => loadStoredMessages());
  const [input, setInput] = useState('');
  const [attachedFile, setAttachedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const listEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const { supported: hasSpeech, listening, startListening, stopListening } = useSpeechRecognition();

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
      }
    } catch {
      // ignore
    }
  }, [messages]);

  useEffect(() => {
    if (typeof listEndRef.current?.scrollIntoView === 'function') {
      listEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleClearChat = useCallback(() => {
    setMessages([]);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(CHAT_STORAGE_KEY, '[]');
      }
    } catch {
      // ignore
    }
  }, []);

  const sendMessage = useCallback(async (text, file = null) => {
    const trimmed = String(text).trim();
    if ((!trimmed && !file) || loading) return;

    const userContent = trimmed || (file ? `(파일 첨부: ${file.name})` : '');
    const history = [...messages, { role: 'user', content: userContent }];
    setMessages(history);
    setInput('');
    setAttachedFile(null);
    setLoading(true);

    const updatedBy = user?.name || user?.loginId || '';
    const chatContext = { updatedBy };

    try {
      let res;
      if (file) {
        const formData = new FormData();
        formData.append('messages', JSON.stringify(history.map((m) => ({ role: m.role, content: m.content }))));
        formData.append('chatContext', JSON.stringify(chatContext));
        formData.append('file', file);
        res = await fetch('/api/chat', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });
      } else {
        res = await fetch('/api/chat', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: history.map((m) => ({ role: m.role, content: m.content })),
            chatContext,
          }),
        });
      }
      const data = await res.json();
      if (data.steps && Array.isArray(data.steps) && data.steps.length > 0) {
        const stepMessages = data.steps.map((stepContent) => ({ role: 'assistant', content: stepContent }));
        setMessages((prev) => [...prev, ...stepMessages]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.content ?? '응답을 받지 못했습니다.' }]);
      }
      if (data.action?.type === 'navigate' && data.action?.path) {
        navigate(data.action.path);
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: '채팅 서버에 연결할 수 없습니다.' }]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages, navigate, user]);

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input, attachedFile);
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    setAttachedFile(f || null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startVoice = () => {
    if (listening) {
      stopListening();
      return;
    }
    startListening((text) => setInput(text), (text) => {
      setInput('');
      sendMessage(text);
    });
  };

  const ui = (
    <>
      {open && (
        <>
          <div className="chat-drawer-overlay" aria-hidden="true" onClick={() => setOpen(false)} />
          <div className="chat-widget-panel">
            <div className="chat-widget-header">
              <span className="chat-widget-title">채팅</span>
              <div className="chat-widget-header-actions">
                <button type="button" aria-label="채팅 초기화" onClick={handleClearChat} className="chat-widget-reset">
                  초기화
                </button>
                <button type="button" aria-label="채팅 닫기" onClick={() => setOpen(false)} className="chat-widget-close">
                  ✕
                </button>
              </div>
            </div>

            <div className="chat-widget-body">
              {messages.length === 0 && (
                <div className="chat-widget-welcome">
                  <p className="chat-widget-greeting">안녕하세요, 고객님!</p>
                  <p className="chat-widget-hint">원자재·납품·생산·재고 메뉴 이동과, 허용된 일괄 작업(예: 납품 요청 전체 삭제)을 도와드립니다.</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`chat-widget-msg ${m.role === 'user' ? 'chat-widget-msg-user' : 'chat-widget-msg-bot'}`}>
                  {m.content}
                </div>
              ))}
              {loading && <div className="chat-widget-loading">답변 중...</div>}
              <div ref={listEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="chat-widget-form">
              {attachedFile && (
                <div className="chat-widget-attached">
                  <span className="chat-widget-attached-name" title={attachedFile.name}>{attachedFile.name}</span>
                  <button type="button" className="chat-widget-attached-remove" onClick={() => setAttachedFile(null)} aria-label="첨부 취소">✕</button>
                </div>
              )}
              <div className="chat-widget-input-wrap">
                <input ref={fileInputRef} type="file" accept={ACCEPT_FILES} onChange={handleFileChange} className="chat-widget-file-input" aria-label="파일 첨부" />
                <button type="button" className="chat-widget-icon-btn" onClick={() => fileInputRef.current?.click()} title="파일 첨부">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                </button>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                  placeholder="메시지를 입력해주세요..."
                  className="chat-widget-input chat-widget-textarea"
                  disabled={loading}
                  rows={Math.max(1, input.split('\n').length)}
                />
                {hasSpeech && (
                  <button
                    type="button"
                    title={listening ? '음성 입력 중지' : '음성 입력'}
                    onClick={startVoice}
                    className={`chat-widget-icon-btn ${listening ? 'chat-widget-icon-btn-active' : ''}`}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </button>
                )}
                <button type="submit" className="chat-widget-send" aria-label="전송">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      <div className="chat-layer-wrap">
        <button
          type="button"
          aria-label={open ? '채팅 닫기' : '채팅 열기'}
          onClick={() => setOpen((o) => !o)}
          className={`chat-toggle-btn ${open ? 'chat-toggle-btn-open' : ''}`}
          title={open ? '채팅 닫기' : '채팅 열기'}
        >
          {open ? (
            <span className="chat-close-icon">✕</span>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" fill="currentColor" />
            </svg>
          )}
        </button>
      </div>
    </>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(ui, document.body);
}

