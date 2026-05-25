import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, RefreshCw, Star, Sun, Moon, Server, Users, Activity,
  ExternalLink, Heart, Shield, Clock, Copy, 
  ChevronRight, BarChart3, History, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Player {
  id: number;
  name: string;
  ping: number;
  identifiers: string[];
  steamId?: string;
  discordId?: string;
  license?: string;
  live?: string;
  xbl?: string;
  key: string;
}

const IDBadge = ({ label, value, color, steamId64 }: { label: string; value: string; color: string; steamId64?: string }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      onClick={handleCopy}
      className={cn(
        "flex items-center gap-2 px-2 py-1 rounded-md text-[10px] font-mono cursor-pointer transition-all border group/badge",
        color,
        "hover:brightness-110 active:scale-95"
      )}
    >
      <span className="font-black uppercase opacity-70">{label}:</span>
      <span className="truncate max-w-[150px]">{copied ? 'MÁSOLVA!' : value}</span>
      {label === 'Steam' && steamId64 && (
        <a 
          href={`https://steamcommunity.com/profiles/${steamId64}`} 
          target="_blank" 
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="ml-1 p-0.5 hover:bg-white/20 rounded transition-colors"
          title="Steam Profil Megnyitása"
        >
          <ExternalLink size={10} />
        </a>
      )}
      <Copy size={10} className={cn("shrink-0 ml-auto opacity-0 group-hover/badge:opacity-100 transition-opacity", copied && "text-green-500 opacity-100")} />
    </div>
  );
};

interface ServerInfo {
  hostname: string;
  clients: number;
  maxClients: number;
  iconUrl: string;
  bannerUrl?: string;
  bannerConnectingUrl?: string;
  mapName?: string;
  gametype?: string;
  version?: string;
  tags?: string[];
  ownerName?: string;
  ownerProfile?: string;
  resources?: string[];
}

interface HistoryItem {
  id: string;
  name: string;
  icon: string;
  date: string;
}

const hexToDecimal = (s: string) => {
  let i, j, digits = [0], carry;
  for (i = 0; i < s.length; i += 1) {
    carry = parseInt(s.charAt(i), 16);
    for (j = 0; j < digits.length; j += 1) {
      digits[j] = digits[j] * 16 + carry;
      carry = (digits[j] / 10) | 0;
      digits[j] %= 10;
    }
    while (carry > 0) {
      digits.push(carry % 10);
      carry = (carry / 10) | 0;
    }
  }
  return digits.reverse().join('');
};

const parseIdentifiers = (ids: string[]) => {
  const result: any = {
    steamId: undefined,
    discordId: undefined,
    license: undefined,
    live: undefined,
    xbl: undefined,
    raw: ids || []
  };
  if (!ids || !Array.isArray(ids)) return result;
  ids.forEach(id => {
    if (id.includes('steam:')) result.steamId = id.replace('steam:', '');
    if (id.includes('discord:')) result.discordId = id.replace('discord:', '');
    if (id.includes('license:')) result.license = id.replace('license:', '').replace('license2:', '');
    if (id.includes('live:')) result.live = id.replace('live:', '');
    if (id.includes('xbl:')) result.xbl = id.replace('xbl:', '');
  });
  return result;
};

const fetchWithFallbacks = async (targetUrl: string) => {
  try {
    const backendRes = await fetch(`/api/fivem?url=${encodeURIComponent(targetUrl)}&cache=${Date.now()}`);
    if (backendRes.ok) return backendRes;
  } catch (e) {
    console.warn('Saját backend nem elérhető, próbálkozás proxykkal...');
  }
  const proxyList = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`
  ];
  for (const pUrl of proxyList) {
    try {
      const res = await fetch(pUrl);
      if (res.ok) return res;
    } catch (e) {}
  }
  throw new Error('Sikertelen kapcsolódás.');
};

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm", className)}>
    {children}
  </div>
);

export default function App() {
  const [serverIdInput, setServerIdInput] = useState('');
  const [currentServerId, setCurrentServerId] = useState('');
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'players' | 'favorites' | 'stats'>('players');
  const [refreshCountdown, setRefreshCountdown] = useState(30);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [favorites, setFavorites] = useState<any[]>(() => JSON.parse(localStorage.getItem('favPlayers') || '[]'));
  const [history, setHistory] = useState<HistoryItem[]>(() => JSON.parse(localStorage.getItem('srvHistory') || '[]'));

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => localStorage.setItem('favPlayers', JSON.stringify(favorites)), [favorites]);
  useEffect(() => localStorage.setItem('srvHistory', JSON.stringify(history)), [history]);

  useEffect(() => {
    if (!currentServerId || loading) return;
    const timer = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          fetchServerData(currentServerId, true);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [currentServerId, loading]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlId = params.get('serverId');
    const savedId = localStorage.getItem('lastServerId');
    if (urlId) {
      setServerIdInput(urlId);
      fetchServerData(urlId);
    } else if (savedId) {
      setServerIdInput(savedId);
      fetchServerData(savedId);
    }
  }, []);

  const fetchServerData = async (id: string, isSilentRefresh = false) => {
    if (!id) return;
    const cleanId = id.trim();
    if (!isSilentRefresh) setLoading(true);
    setError(null);

    const cacheBuster = `?v=${Date.now()}`;
    const targetUrl = `https://servers-frontend.fivem.net/api/servers/single/${cleanId}${cacheBuster}`;

    try {
      // 1. LEKÉRÉS: Alapadatok a FiveM hivatalos API-jától
      const res = await fetchWithFallbacks(targetUrl);
      const text = await res.text();
      
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*"Data"[\s\S]*\}/);
        if (jsonMatch) json = JSON.parse(jsonMatch[0]);
        else throw new Error('Nem sikerült feldolgozni a szerver válaszát.');
      }
      
      if (json?.Data) {
        const data = json.Data;
        const rawHostname = data.hostname || 'Ismeretlen Szerver';
        const hostname = rawHostname.replace(/\^\d/g, '').trim();
        
        let iconUrl = `https://servers-live.fivem.net/servers/icon/${cleanId}/${data.iconVersion}.png`;
        if (!data.iconVersion) iconUrl = 'https://fivem.net/favicon.png';

        setServerInfo({
          hostname,
          clients: data.clients || 0,
          maxClients: data.svMaxclients || data.sv_maxclients || 0,
          iconUrl,
          bannerUrl: data.vars?.banner_detail || data.vars?.banner_connecting,
          bannerConnectingUrl: data.vars?.banner_connecting,
          mapName: data.mapname,
          gametype: data.gametype,
          version: data.server,
          tags: data.vars?.tags?.split(',') || [],
          ownerName: data.ownerName,
          ownerProfile: data.ownerProfile,
          resources: data.resources || []
        });

        // Alap, cenzúrázott játékoslista betöltése
        let formattedPlayers = (data.players || []).map((p: any, idx: number) => {
          const pIdentifiers = Array.isArray(p.identifiers) ? p.identifiers : [];
          const parsedIds = parseIdentifiers(pIdentifiers);
          return {
            id: p.id || 0,
            name: p.name || 'Ismeretlen',
            ping: p.ping || 0,
            identifiers: pIdentifiers,
            steamId: parsedIds.steamId,
            discordId: parsedIds.discordId,
            license: parsedIds.license,
            live: parsedIds.live,
            xbl: parsedIds.xbl,
            steamId64: parsedIds.steamId ? hexToDecimal(parsedIds.steamId) : undefined,
            key: pIdentifiers[0] || `player-${p.id}-${idx}`
          };
        }).sort((a: any, b: any) => a.id - b.id);

        // 2. LEKÉRÉS: Agresszív Spoofing a saját backendünkön keresztül a rejtett adatokért
        if (data.connectEndPoints && data.connectEndPoints.length > 0) {
          try {
            const serverIp = data.connectEndPoints[0];
            const directUrl = `http://${serverIp}/players.json`;
            console.log(`Bypass kísérlet a közvetlen IP-n: ${directUrl}`);
            
            // Itt a backendünk CitizenFX kliensnek hazudja magát!
            const directRes = await fetch(`/api/fivem?url=${encodeURIComponent(directUrl)}`);
            
            if (directRes.ok) {
              const directPlayers = await directRes.json();
              if (Array.isArray(directPlayers) && directPlayers.length > 0) {
                console.log("🔥 Bypass sikeres! Rejtett azonosítók betöltve.");
                
                // Kicseréljük az üres azonosítókat a kinyert adatokra
                formattedPlayers = directPlayers.map((p: any, idx: number) => {
                  const pIdentifiers = Array.isArray(p.identifiers) ? p.identifiers : [];
                  const parsedIds = parseIdentifiers(pIdentifiers);
                  return {
                    id: p.id || 0,
                    name: p.name || 'Ismeretlen',
                    ping: p.ping || 0,
                    identifiers: pIdentifiers,
                    steamId: parsedIds.steamId,
                    discordId: parsedIds.discordId,
                    license: parsedIds.license,
                    live: parsedIds.live,
                    xbl: parsedIds.xbl,
                    steamId64: parsedIds.steamId ? hexToDecimal(parsedIds.steamId) : undefined,
                    key: pIdentifiers[0] || `player-${p.id}-${idx}`
                  };
                }).sort((a: any, b: any) => a.id - b.id);
              }
            }
          } catch (err) {
            console.warn("A Bypass kísérlet nem sikerült.", err);
          }
        }

        setPlayers(formattedPlayers);
        setCurrentServerId(cleanId);
        localStorage.setItem('lastServerId', cleanId);
        setHistory(prev => {
          const filtered = prev.filter(h => h.id !== cleanId);
          return [{ id: cleanId, name: hostname, icon: iconUrl, date: new Date().toISOString() }, ...filtered].slice(0, 8);
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshCountdown(30);
    }
  };

  const filteredPlayers = useMemo(() => {
    return players.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.id.toString() === searchQuery ||
      p.steamId?.includes(searchQuery) ||
      p.discordId?.includes(searchQuery)
    );
  }, [players, searchQuery]);

  const toggleFavorite = (player: Player) => {
    setFavorites(prev => {
      const isFav = prev.some(f => f.key === player.key);
      if (isFav) return prev.filter(f => f.key !== player.key);
      return [...prev, { key: player.key, name: player.name, id: player.id }];
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b0f1a] text-slate-900 dark:text-slate-100 font-sans selection:bg-blue-500/30 transition-colors duration-300">
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.location.reload()}>
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
              <Server className="text-white" size={20} />
            </div>
            <span className="font-black text-xl tracking-tight hidden sm:block">FIVEM<span className="text-blue-600">EXPLORER</span></span>
          </div>
          <div className="flex-1 max-w-md relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
            <form onSubmit={(e) => { e.preventDefault(); fetchServerData(serverIdInput); }}>
              <input
                type="text"
                value={serverIdInput}
                onChange={(e) => setServerIdInput(e.target.value)}
                placeholder="Szerver ID (pl. vp4rxq)"
                className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium"
              />
            </form>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'dark' ? <Sun size={20} className="text-amber-400" /> : <Moon size={20} className="text-slate-600" />}
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <AnimatePresence mode="wait">
          {serverInfo ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              <Card className="lg:col-span-2 overflow-hidden relative group min-h-[420px] border-none shadow-2xl flex flex-col justify-end bg-slate-950 rounded-[2.5rem]">
                <div className="absolute inset-0 z-0">
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent z-10" />
                  <motion.div 
                    initial={{ scale: 1.2, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 1.5 }}
                    className="w-full h-full"
                  >
                    {serverInfo.bannerUrl ? (
                      <img 
                        src={serverInfo.bannerUrl} 
                        className="w-full h-full object-cover opacity-50"
                        alt=""
                        onError={(e: any) => e.target.style.display = 'none'}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-blue-900/40 to-indigo-900/40" />
                    )}
                    <img 
                      src={serverInfo.iconUrl} 
                      className="absolute inset-0 w-full h-full object-cover opacity-20 blur-[120px] scale-150"
                      alt=""
                    />
                  </motion.div>
                </div>

                <div className="relative z-20 p-6 md:p-12 space-y-8">
                  <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                    <div className="bg-emerald-500 text-white text-[11px] font-black px-4 py-1.5 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.4)] uppercase tracking-widest">Live Server</div>
                    {serverInfo.mapName && <div className="bg-white/10 backdrop-blur-xl text-white text-[11px] font-black px-4 py-1.5 rounded-xl border border-white/10 uppercase tracking-widest">{serverInfo.mapName}</div>}
                  </div>

                  <div className="flex flex-col md:flex-row gap-8 items-center md:items-end text-center md:text-left">
                    <div className="relative group/icon shrink-0">
                      <div className="absolute -inset-6 bg-blue-500 rounded-full blur-[50px] opacity-30 group-hover/icon:opacity-60 transition-opacity duration-700"></div>
                      <img 
                        src={serverInfo.iconUrl} 
                        className="relative w-32 h-32 md:w-44 md:h-44 rounded-[3rem] object-cover border-4 border-white/20 bg-slate-800 shadow-2xl transition-transform duration-500 group-hover/icon:scale-105"
                        alt="Logo"
                        onError={(e: any) => e.target.src = 'https://fivem.net/favicon.png'}
                      />
                    </div>

                    <div className="flex-1 min-w-0 space-y-6 pb-2">
                      <h1 className="text-3xl md:text-5xl lg:text-7xl font-black text-white leading-[0.9] tracking-tighter drop-shadow-[0_15px_15px_rgba(0,0,0,0.6)]">
                        {serverInfo.hostname.length > 50 ? serverInfo.hostname.substring(0, 50) + '...' : serverInfo.hostname}
                      </h1>
                      
                      <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-4 rounded-[2rem] flex items-center gap-4 shadow-2xl shadow-blue-500/40 border border-white/20">
                          <Users size={32} className="text-white" />
                          <div className="flex flex-col leading-none">
                            <span className="text-3xl font-black text-white">{serverInfo.clients}</span>
                            <span className="text-[10px] text-white/60 font-black uppercase tracking-widest">Online / {serverInfo.maxClients}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-6 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-sm font-medium">Auto Frissítés</span>
                    <span className="text-blue-500 font-black tabular-nums">{refreshCountdown}s</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-blue-500"
                      initial={{ width: "100%" }}
                      animate={{ width: `${(refreshCountdown / 30) * 100}%` }}
                      transition={{ duration: 1, ease: "linear" }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-6">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1"><Clock size={10}/> Uptime</div>
                    <div className="text-sm font-bold">99.9%</div>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1"><Shield size={10}/> Version</div>
                    <div className="text-sm font-bold truncate">{serverInfo.version?.split(' ')[0] || 'Unknown'}</div>
                  </div>
                </div>
                <button 
                  onClick={() => fetchServerData(currentServerId)}
                  disabled={loading}
                  className="mt-4 w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                  Kézi Frissítés
                </button>
              </Card>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-20 flex flex-col items-center justify-center text-center space-y-6"
            >
              <div className="w-24 h-24 bg-slate-100 dark:bg-slate-900 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-700">
                <Search size={48} />
              </div>
              <div>
                <h2 className="text-2xl font-black">Nincs kiválasztott szerver</h2>
                <p className="text-slate-500 mt-2 max-w-xs">Adj meg egy FiveM Szerver ID-t a fenti keresőben a részletek megtekintéséhez.</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {history.map(srv => (
                  <button 
                    key={srv.id}
                    onClick={() => { setServerIdInput(srv.id); fetchServerData(srv.id); }}
                    className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-blue-500 transition-colors"
                  >
                    <img src={srv.icon} className="w-5 h-5 rounded-md" alt="" />
                    <span className="text-sm font-bold">{srv.name}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 p-4 rounded-2xl flex items-center gap-3 text-rose-600 dark:text-rose-400">
            <AlertCircle size={20} />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {currentServerId && !error && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex bg-slate-200/50 dark:bg-slate-900 p-1 rounded-xl w-fit">
                {[
                  { id: 'players', label: 'Játékosok', icon: Users },
                  { id: 'favorites', label: 'Kedvencek', icon: Star },
                  { id: 'stats', label: 'Statisztika', icon: BarChart3 }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
                      activeTab === tab.id 
                        ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm" 
                        : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    )}
                  >
                    <tab.icon size={16} />
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === 'players' && (
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Keresés..."
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            <Card className="overflow-hidden">
              <AnimatePresence mode="wait">
                {activeTab === 'players' && (
                  <motion.div 
                    key="players-tab"
                    initial={{ opacity: 0, x: 20 }} 
                    animate={{ opacity: 1, x: 0 }} 
                    exit={{ opacity: 0, x: -20 }}
                  >
                    {players.length > 0 && (
                      <div className={cn(
                        "p-3 border-b text-xs font-bold flex items-center gap-2",
                        players.some(p => p.identifiers && p.identifiers.length > 0)
                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                          : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
                      )}>
                        <AlertCircle size={14} />
                        {players.some(p => p.identifiers && p.identifiers.length > 0)
                          ? `AZONOSÍTÓK BETÖLTVE: ${players.filter(p => p.identifiers?.length > 0).length}/${players.length} játékos`
                          : "A SZERVER ELREJTI AZ AZONOSÍTÓKAT - Még a Bypass sem segített."
                        }
                      </div>
                    )}

                    <div className="hidden lg:block overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-400 text-[11px] font-black uppercase tracking-wider">
                            <th className="px-6 py-4 w-16 text-center">ID</th>
                            <th className="px-6 py-4">Játékos</th>
                            <th className="px-6 py-4">Azonosítók</th>
                            <th className="px-6 py-4 text-right">Ping</th>
                            <th className="px-6 py-4 w-16"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredPlayers.length > 0 ? filteredPlayers.map((player) => {
                            const isFav = favorites.some(f => f.key === player.key);
                            const p = player as any;
                            return (
                              <tr key={player.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                <td className="px-6 py-4 font-mono font-bold text-slate-400 text-sm text-center">#{player.id}</td>
                                <td className="px-6 py-4">
                                  <div className="font-bold flex items-center gap-2">
                                    {player.name}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex flex-wrap gap-1.5 max-w-xl">
                                    {p.steamId && <IDBadge label="Steam" value={p.steamId} steamId64={p.steamId64} color="bg-blue-500/10 text-blue-500 border-blue-500/20" />}
                                    {p.discordId && <IDBadge label="Discord" value={p.discordId} color="bg-indigo-500/10 text-indigo-500 border-indigo-500/20" />}
                                    {p.license && <IDBadge label="License" value={p.license} color="bg-emerald-500/10 text-emerald-500 border-emerald-500/20" />}
                                    {p.live && <IDBadge label="Live" value={p.live} color="bg-rose-500/10 text-rose-500 border-rose-500/20" />}
                                    {p.xbl && <IDBadge label="Xbox" value={p.xbl} color="bg-green-600/10 text-green-600 border-green-600/20" />}
                                    {(!p.identifiers || p.identifiers.length === 0) && <span className="text-[10px] text-slate-400 italic">Rejtett adatok</span>}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <span className={cn(
                                    "px-2 py-1 rounded-md text-[11px] font-black tabular-nums",
                                    player.ping < 50 ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400" :
                                    player.ping < 100 ? "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400" :
                                    "bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400"
                                  )}>
                                    {player.ping} MS
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <button onClick={() => toggleFavorite(player)} className={cn("p-2 rounded-lg transition-all", isFav ? "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30" : "text-slate-300 hover:text-yellow-500")}>
                                    <Star size={18} fill={isFav ? "currentColor" : "none"} />
                                  </button>
                                </td>
                              </tr>
                            );
                          }) : (
                            <tr><td colSpan={5} className="px-6 py-20 text-center"><p className="text-slate-400">Nincs találat</p></td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredPlayers.length > 0 ? filteredPlayers.map((player) => {
                        const isFav = favorites.some(f => f.key === player.key);
                        return (
                          <div key={player.id} className="p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-mono font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">#{player.id}</span>
                                <span className="font-bold text-lg">{player.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[10px] font-black",
                                  player.ping < 50 ? "text-emerald-500 bg-emerald-500/10" : "text-amber-500 bg-amber-500/10"
                                )}>
                                  {player.ping}MS
                                </span>
                                <button onClick={() => toggleFavorite(player)} className={cn("p-2", isFav ? "text-yellow-500" : "text-slate-300")}>
                                  <Star size={20} fill={isFav ? "currentColor" : "none"} />
                                </button>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {(player as any).steamId && <IDBadge label="Steam" value={(player as any).steamId} steamId64={(player as any).steamId64} color="bg-blue-500/10 text-blue-500 border-blue-500/20" />}
                              {(player as any).discordId && <IDBadge label="Discord" value={(player as any).discordId} color="bg-indigo-500/10 text-indigo-500 border-indigo-500/20" />}
                              {(player as any).license && <IDBadge label="License" value={(player as any).license} color="bg-emerald-500/10 text-emerald-500 border-emerald-500/20" />}
                              {(player as any).live && <IDBadge label="Live" value={(player as any).live} color="bg-rose-500/10 text-rose-500 border-rose-500/20" />}
                              {(player as any).xbl && <IDBadge label="Xbox" value={(player as any).xbl} color="bg-green-600/10 text-green-600 border-green-600/20" />}
                              {(!player.identifiers || player.identifiers.length === 0) && <span className="text-[10px] text-slate-400 italic">A szerver által elrejtett azonosítók</span>}
                            </div>
                          </div>
                        );
                      }) : (
                        <div className="p-10 text-center text-slate-400">Nincs találat</div>
                      )}
                    </div>
                  </motion.div>
                )}

                {activeTab === 'favorites' && (
                  <motion.div 
                    key="fav-tab"
                    initial={{ opacity: 0, x: 20 }} 
                    animate={{ opacity: 1, x: 0 }} 
                    exit={{ opacity: 0, x: -20 }}
                    className="p-8"
                  >
                    {favorites.length === 0 ? (
                      <div className="text-center py-20 text-slate-400">
                        <Star size={40} className="mx-auto mb-4 opacity-20" />
                        <p>Még nincsenek kedvenc játékosaid.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {favorites.map(fav => {
                          const onlinePlayer = players.find(p => p.key === fav.key);
                          return (
                            <div key={fav.key} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between group">
                              <div className="flex items-center gap-3">
                                <div className={cn("w-2 h-2 rounded-full", onlinePlayer ? "bg-emerald-500" : "bg-slate-300")} />
                                <div>
                                  <div className="font-bold truncate max-w-[150px]">{fav.name}</div>
                                  <div className="text-[10px] uppercase font-black text-slate-400">
                                    {onlinePlayer ? `ID: ${onlinePlayer.id} • ${onlinePlayer.ping}ms` : 'OFFLINE'}
                                  </div>
                                </div>
                              </div>
                              <button 
                                onClick={() => toggleFavorite({ key: fav.key } as Player)}
                                className="p-2 text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Star size={18} fill="currentColor" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                )}

                {activeTab === 'stats' && (
                  <motion.div 
                    key="stats-tab"
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8"
                  >
                    <div className="space-y-6">
                      <h3 className="font-black text-lg flex items-center gap-2">
                        <Activity className="text-blue-500" size={20} />
                        Ping Analízis
                      </h3>
                      <div className="space-y-4">
                        {[
                          { label: 'Kiváló (0-50ms)', count: players.filter(p => p.ping <= 50).length, color: 'bg-emerald-500' },
                          { label: 'Stabil (51-100ms)', count: players.filter(p => p.ping > 50 && p.ping <= 100).length, color: 'bg-amber-500' },
                          { label: 'Gyenge (101ms+)', count: players.filter(p => p.ping > 100).length, color: 'bg-rose-500' },
                        ].map(stat => {
                          const percentage = players.length ? (stat.count / players.length) * 100 : 0;
                          return (
                            <div key={stat.label}>
                              <div className="flex justify-between text-xs font-bold mb-2">
                                <span className="text-slate-500">{stat.label}</span>
                                <span>{stat.count} db ({Math.round(percentage)}%)</span>
                              </div>
                              <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <motion.div 
                                  className={cn("h-full", stat.color)}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${percentage}%` }}
                                  transition={{ duration: 1 }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-6">
                      <h3 className="font-black text-lg flex items-center gap-2">
                        <History className="text-indigo-500" size={20} />
                        Keresési Előzmények
                      </h3>
                      <div className="grid grid-cols-1 gap-2">
                        {history.map(item => (
                          <button 
                            key={item.id}
                            onClick={() => { setServerIdInput(item.id); fetchServerData(item.id); }}
                            className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                          >
                            <div className="flex items-center gap-3">
                              <img src={item.icon} className="w-8 h-8 rounded-lg shadow-sm" alt="" />
                              <div>
                                <div className="text-sm font-bold truncate max-w-[180px]">{item.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{item.id}</div>
                              </div>
                            </div>
                            <ChevronRight size={16} className="text-slate-300" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </div>
        )}
      </main>

      <footer className="max-w-7xl mx-auto px-4 py-12 text-center">
        <div className="h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-800 to-transparent mb-8" />
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-6 uppercase tracking-[0.2em] font-bold">
          FiveM Explorer &copy; 2026 • Független projekt
        </p>
        <div className="inline-flex items-center gap-4 px-6 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full shadow-sm">
          <span className="text-sm font-black flex items-center gap-2">
            Készítette <Heart size={14} className="text-rose-500 fill-current" /> <span className="text-blue-600">Szaby</span>
          </span>
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-800" />
          <a href="#" className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors">Discord</a>
          <a href="#" className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors">API Status</a>
        </div>
      </footer>
    </div>
  );
}
