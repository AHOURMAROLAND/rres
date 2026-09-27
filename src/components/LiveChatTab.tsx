import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Smile, Shield, Sparkles } from 'lucide-react';
import { ChatMessage, User } from '../types';
import { soundManager } from '../services/sound';

interface LiveChatTabProps {
  user: User;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  { id: '1', sender: 'Ibrahim_Abidjan', avatar: '👨🏾‍✈️', text: 'Salut l\'équipe ! Belle montée au dernier tour 🔥', timestamp: Date.now() - 140000 },
  { id: '2', sender: 'Fatou_Dakar', avatar: '👩🏾', text: 'J\'ai sécurisé à 3.85x merci le vol !! 🚀🚀', timestamp: Date.now() - 95000, highlight: true },
  { id: '3', sender: 'Koffi_Lome', avatar: '⚡', text: 'Attention prudence après les 10x souvent ça crash vite', timestamp: Date.now() - 50000 },
  { id: '4', sender: 'Mamadou_Bamako', avatar: '🎯', text: 'Allez l\'avion décolle bien ce soir !', timestamp: Date.now() - 20000 },
];

const RANDOM_PILOT_MESSAGES = [
  { sender: 'Amadou_CI', avatar: '🚀', text: 'Retrait propre à 2.40x ! Merci Wave' },
  { sender: 'Aïcha_Ouaga', avatar: '✨', text: 'Ce tour-ci je vise le 5x minimum ✈️' },
  { sender: 'Samuel_Camer', avatar: '🦁', text: 'Gros respect aux pilotes patients !' },
  { sender: 'Yacouba_SN', avatar: '💰', text: 'Pari auto activé à 2.00x, la stratégie paie !' },
  { sender: 'Chantal_BJ', avatar: '👑', text: 'Encore un beau vol les amis 👏' },
  { sender: 'Seydou_ML', avatar: '🔥', text: 'Incroyable le 14x de tout à l\'heure !!' },
  { sender: 'Junior_TG', avatar: '✈️', text: 'L\'adrénaline pure ce jeu haha' },
];

const QUICK_EMOJIS = ['🚀', '🔥', '💰', '🎯', '👏', '✈️', '😎'];

export const LiveChatTab: React.FC<LiveChatTabProps> = ({ user }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputVal, setInputVal] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Periodically add simulated messages
  useEffect(() => {
    const interval = setInterval(() => {
      const randomMsg = RANDOM_PILOT_MESSAGES[Math.floor(Math.random() * RANDOM_PILOT_MESSAGES.length)];
      setMessages((prev) => [
        ...prev.slice(-40),
        {
          id: 'bot-' + Date.now(),
          sender: randomMsg.sender,
          avatar: randomMsg.avatar,
          text: randomMsg.text,
          timestamp: Date.now(),
          highlight: Math.random() > 0.7,
        },
      ]);
    }, 12000 + Math.random() * 8000);

    return () => clearInterval(interval);
  }, []);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;

    soundManager.playClick();
    const newMsg: ChatMessage = {
      id: 'user-' + Date.now(),
      sender: user.name || 'Moi',
      avatar: '👨🏾‍✈️',
      text: inputVal.trim(),
      timestamp: Date.now(),
      isUser: true,
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputVal('');
  };

  const handleQuickEmoji = (emoji: string) => {
    soundManager.playClick();
    const newMsg: ChatMessage = {
      id: 'user-' + Date.now(),
      sender: user.name || 'Moi',
      avatar: '👨🏾‍✈️',
      text: emoji + ' ' + emoji,
      timestamp: Date.now(),
      isUser: true,
    };
    setMessages((prev) => [...prev, newMsg]);
  };

  return (
    <div className="bg-[#0B0F19] rounded-2xl border border-slate-800 p-3 sm:p-4 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          <span className="font-display font-bold text-sm text-white flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4 text-orange-400" />
            Tchat des Pilotes en Direct
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-slate-400">
          <Shield className="w-3 h-3 text-emerald-400" />
          <span>Modéré & Fair-play</span>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div ref={scrollRef} className="mt-2.5 flex-1 overflow-y-auto max-h-[220px] sm:max-h-[240px] pr-1 space-y-2 no-scrollbar">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`p-2 rounded-xl text-xs transition-colors flex flex-col gap-0.5 ${
              m.isUser
                ? 'bg-orange-950/40 border border-orange-700/50 text-orange-100 ml-4'
                : m.highlight
                ? 'bg-amber-950/30 border border-amber-600/40 text-amber-200'
                : 'bg-slate-900/70 border border-slate-800/80 text-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{m.avatar}</span>
                <span className="font-bold text-[11px] text-slate-200">
                  {m.sender}
                </span>
                {m.isUser && (
                  <span className="px-1.5 py-0.2 rounded bg-orange-500 text-white font-bold text-[9px]">
                    VOUS
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-500 font-mono-num">
                {new Date(m.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-xs text-slate-300 pl-5 leading-relaxed break-words">
              {m.text}
            </p>
          </div>
        ))}
      </div>

      {/* Quick emoji reaction bar */}
      <div className="pt-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <span className="text-[10px] text-slate-400 flex items-center gap-1 shrink-0 font-medium">
          <Smile className="w-3 h-3 text-slate-400" /> Réactions :
        </span>
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => handleQuickEmoji(emoji)}
            className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs transition-transform hover:scale-110 active:scale-95 cursor-pointer shrink-0"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Input bar */}
      <form onSubmit={handleSend} className="mt-2 flex items-center gap-1.5">
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="Envoyer un message aux pilotes..."
          maxLength={100}
          className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder:text-slate-600 outline-none focus:border-orange-500"
        />
        <button
          type="submit"
          className="p-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white transition-colors cursor-pointer active:scale-95 shadow-md shadow-orange-600/30"
          title="Envoyer"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
