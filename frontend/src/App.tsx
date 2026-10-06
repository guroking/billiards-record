import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3000' : '';

const UNI_NAMES: Record<string, string> = {
  mmu: '목포해양대',
  dmu: '동양미래대',
  yuhan: '유한대',
  dankook: '단국대',
  cbnu: '충북대'
};

interface Player {
  id: number;
  name: string;
  billiard_handicap: number | null;
  score: number;
  wins: number;
  losses: number;
}

interface Match {
  id: number;
  winner_ids: number[];
  loser_ids: number[];
  winner_names: string[];
  loser_names: string[];
  match_date: string;
  game_type: string;
  match_format: string;
  match_type: string;
  elo_change: number;
  target_score: number;
}

export default function App() {
  const [uniCode, setUniCode] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('home');
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [toast, setToast] = useState({ visible: false, message: '' });

  // 선수 등록 상태
  const [regName, setRegName] = useState<string>('');
  const [regHandicap, setRegHandicap] = useState<string>('');

  // 경기 기록 상태
  const [matchFormat, setMatchFormat] = useState<string>('1:1');
  const [matchType, setMatchType] = useState<string>('승급전');
  const [gameType, setGameType] = useState<string>('4구');
  const [targetScore, setTargetScore] = useState<string>('');
  const [winners, setWinners] = useState<string[]>(['']);
  const [losers, setLosers] = useState<string[]>(['']);
  const [password, setPassword] = useState<string>('');

  // 수정 모드 상태
  const [editingMatchId, setEditingMatchId] = useState<number | null>(null);

  // 상대 전적 상태
  const [h2hP1, setH2hP1] = useState<string>('');
  const [h2hP2, setH2hP2] = useState<string>('');
  const [h2hRecords, setH2hRecords] = useState<Match[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uni = params.get('uni');
    if (uni && UNI_NAMES[uni]) {
      setUniCode(uni);
      fetchData(uni);
    }
  }, []);

  const showToast = (msg: string) => {
    setToast({ visible: true, message: msg });
    setTimeout(() => setToast({ visible: false, message: '' }), 3000);
  };

  const fetchData = async (code: string) => {
    try {
      const pRes = await fetch(`${API_BASE}/api/${code}/players`);
      const pData = await pRes.json();
      if (pData.success) setPlayers(pData.players);

      const mRes = await fetch(`${API_BASE}/api/${code}/matches`);
      const mData = await mRes.json();
      if (mData.success) setMatches(mData.matches);
    } catch (err) {
      console.error(err);
      showToast('데이터를 불러오지 못했습니다.');
    }
  };

  const handleRegister = async () => {
    if (!regName.trim()) return showToast('이름을 입력해주세요.');
    try {
      const res = await fetch(`${API_BASE}/api/${uniCode}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: regName, handicap: regHandicap || null })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`${regName} 선수 등록 완료!`);
        setRegName('');
        setRegHandicap('');
        fetchData(uniCode);
      } else {
        showToast(data.error);
      }
    } catch (err) {
      showToast('서버 통신 오류');
    }
  };

  const handleFormatChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const format = e.target.value;
    setMatchFormat(format);
    if (format === '1:1') {
      setWinners(['']); setLosers(['']);
    } else if (format === '2:2') {
      setWinners(['', '']); setLosers(['', '']);
      setMatchType('일반내기');
    } else if (format === '1:1:1') {
      setWinners(['']); setLosers(['', '']);
      setMatchType('일반내기');
    }
  };

  const updateArray = (setter: React.Dispatch<React.SetStateAction<string[]>>, array: string[], index: number, value: string) => {
    const newArr = [...array];
    newArr[index] = value;
    setter(newArr);
  };

  const handleRecordMatch = async () => {
    if (winners.includes('') || losers.includes('')) return showToast('모든 선수를 선택해주세요.');

    const payload = {
      winner_ids: winners.map(Number),
      loser_ids: losers.map(Number),
      game_type: gameType,
      match_format: matchFormat,
      match_type: matchType,
      target_score: targetScore ? Number(targetScore) : 0,
      password: password || '1234'
    };

    try {
      let res;
      if (editingMatchId) {
        res = await fetch(`${API_BASE}/api/${uniCode}/matches/${editingMatchId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch(`${API_BASE}/api/${uniCode}/matches`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (data.success) {
        showToast(editingMatchId ? '전적이 수정되었습니다! ✏️' : '경기 결과가 저장되었습니다! 🏆');
        setWinners(winners.map(() => ''));
        setLosers(losers.map(() => ''));
        setTargetScore('');
        setPassword('');
        setEditingMatchId(null);
        fetchData(uniCode);
      } else {
        showToast(data.error);
      }
    } catch (err) {
      showToast('서버 통신 오류');
    }
  };

  const startEditMatch = (m: Match) => {
    setEditingMatchId(m.id);
    setMatchFormat(m.match_format);
    setMatchType(m.match_type);
    setGameType(m.game_type);
    setTargetScore(m.target_score ? m.target_score.toString() : '');
    setWinners(m.winner_ids.map(String));
    setLosers(m.loser_ids.map(String));
    setActiveTab('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingMatchId(null);
    setWinners(['']);
    setLosers(['']);
    setTargetScore('');
  };

  const handleUndo = async (matchId: number) => {
    const pwd = prompt('기록을 취소하려면 학교 공용 비밀번호를 입력하세요:');
    if (!pwd) return;

    try {
      const res = await fetch(`${API_BASE}/api/${uniCode}/matches/${matchId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });
      const data = await res.json();
      if (data.success) {
        showToast('기록이 성공적으로 취소되었습니다.');
        fetchData(uniCode);
      } else {
        alert(data.error);
      }
    } catch (err) {
      showToast('서버 통신 오류');
    }
  };

  const fetchH2H = async () => {
    if (!h2hP1 || !h2hP2 || h2hP1 === h2hP2) return showToast('서로 다른 두 선수를 선택해주세요.');
    try {
      const res = await fetch(`${API_BASE}/api/${uniCode}/head-to-head?p1=${h2hP1}&p2=${h2hP2}`);
      const data = await res.json();
      if (data.success) {
        setH2hRecords(data.records);
      }
    } catch (err) {
      showToast('상대 전적 조회 오류');
    }
  };

  if (!uniCode) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold mb-6 text-gray-900">🎱 당구 전적판</h1>
          <select className="w-full p-4 mb-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none" id="uni-select">
            {Object.entries(UNI_NAMES).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
          <button className="w-full bg-blue-500 text-white font-bold p-4 rounded-xl active:bg-blue-600 transition" onClick={() => window.location.href = `/?uni=${(document.getElementById('uni-select') as HTMLSelectElement).value}`}>
            입장하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 pb-24 font-sans">
      <header className="p-6 flex justify-between items-center sticky top-0 bg-gray-50/90 dark:bg-gray-900/90 backdrop-blur-md z-10">
        <h1 className="text-2xl font-bold tracking-tight">{UNI_NAMES[uniCode]} 전적판</h1>
        <a href="/" className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400">학교 변경</a>
      </header>

      <main className="max-w-md mx-auto px-4">
        
        {/* 탭 1: 홈 */}
        <div className={activeTab === 'home' ? 'block' : 'hidden'}>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm mb-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">{editingMatchId ? '✏️ 대전기록 수정 중' : '⚔️ 경기 결과 기록'}</h3>
              {editingMatchId && (
                <button onClick={cancelEdit} className="text-xs bg-gray-200 dark:bg-gray-700 px-2.5 py-1 rounded-lg">수정 취소</button>
              )}
            </div>
            
            <div className="flex gap-2 mb-4">
              <select className="flex-1 p-3 bg-gray-100 dark:bg-gray-700 rounded-xl outline-none" value={matchFormat} onChange={handleFormatChange}>
                <option value="1:1">1:1 진검승부</option>
                <option value="2:2">2:2 팀전</option>
                <option value="1:1:1">1:1:1 (3인)</option>
              </select>
              <select className="flex-1 p-3 bg-gray-100 dark:bg-gray-700 rounded-xl outline-none" value={matchType} onChange={(e) => setMatchType(e.target.value)}>
                <option value="승급전" disabled={matchFormat !== '1:1'}>승급전 (1:1전용)</option>
                <option value="일반내기">일반 내기</option>
                <option value="몰빵">몰빵</option>
              </select>
            </div>
            
            {matchFormat !== '1:1' && (
              <p className="text-xs text-red-500 mb-4 font-medium">⚠️ 다인전/팀전은 랭킹 점수(승급전)가 변동되지 않습니다.</p>
            )}

            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl mb-4 border border-gray-100 dark:border-gray-700">
              <div className="text-sm font-bold text-blue-500 mb-2">👑 승리 선수 ({winners.length}명)</div>
              {winners.map((val, idx) => (
                <select key={`w-${idx}`} className="w-full p-3 mb-2 bg-white dark:bg-gray-800 rounded-xl outline-none text-sm" value={val} onChange={(e) => updateArray(setWinners, winners, idx, e.target.value)}>
                  <option value="">선수 선택</option>
                  {players.map(p => <option key={p.id} value={p.id.toString()}>{p.name} {p.billiard_handicap && `(${p.billiard_handicap})`}</option>)}
                </select>
              ))}

              <div className="text-center font-black text-gray-300 dark:text-gray-500 my-2">VS</div>

              <div className="text-sm font-bold text-red-500 mb-2">💀 패배 선수 ({losers.length}명)</div>
              {losers.map((val, idx) => (
                <select key={`l-${idx}`} className="w-full p-3 mb-2 bg-white dark:bg-gray-800 rounded-xl outline-none text-sm" value={val} onChange={(e) => updateArray(setLosers, losers, idx, e.target.value)}>
                  <option value="">선수 선택</option>
                  {players.map(p => <option key={p.id} value={p.id.toString()}>{p.name} {p.billiard_handicap && `(${p.billiard_handicap})`}</option>)}
                </select>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <select className="col-span-1 p-3 bg-gray-100 dark:bg-gray-700 rounded-xl outline-none w-full" value={gameType} onChange={(e) => setGameType(e.target.value)}>
                <option value="4구">4구</option>
                <option value="3쿠션">3쿠션</option>
                <option value="포켓볼">포켓볼</option>
              </select>
              <input type="number" placeholder="목표 점수 (예:150)" className="col-span-2 p-3 bg-gray-100 dark:bg-gray-700 rounded-xl outline-none w-full placeholder:text-gray-400" value={targetScore} onChange={(e) => setTargetScore(e.target.value)} />
            </div>

            <div className="mb-4">
              <input type="password" placeholder="공용 비밀번호 (기본: 1234)" className="w-full p-3 bg-gray-100 dark:bg-gray-700 rounded-xl outline-none placeholder:text-gray-400" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            
            <button className={`w-full font-bold p-4 rounded-xl text-white ${editingMatchId ? 'bg-amber-500 active:bg-amber-600' : 'bg-blue-500 active:bg-blue-600'}`} onClick={handleRecordMatch}>
              {editingMatchId ? '수정 완료하기' : '결과 저장하기'}
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm">
            <h3 className="font-bold text-lg mb-4">👤 선수 등록</h3>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <input type="text" placeholder="이름" className="col-span-2 p-3 bg-gray-100 dark:bg-gray-700 rounded-xl outline-none w-full" value={regName} onChange={(e) => setRegName(e.target.value)} />
              <input type="number" placeholder="수지(선택)" className="col-span-1 p-3 bg-gray-100 dark:bg-gray-700 rounded-xl outline-none w-full" value={regHandicap} onChange={(e) => setRegHandicap(e.target.value)} />
            </div>
            <button className="w-full border-2 border-blue-100 text-blue-500 dark:border-blue-900 dark:text-blue-400 font-bold p-4 rounded-xl active:bg-blue-50" onClick={handleRegister}>
              선수 등록하기
            </button>
          </div>
        </div>

        {/* 탭 2: 랭킹 & 상대 전적 */}
        <div className={activeTab === 'ranking' ? 'block' : 'hidden'}>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm mb-4">
            <h3 className="font-bold text-lg mb-3">⚔️ 상대 전적 비교</h3>
            <div className="flex gap-2 mb-3">
              <select className="flex-1 p-2.5 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm outline-none" value={h2hP1} onChange={(e) => setH2hP1(e.target.value)}>
                <option value="">선수 A</option>
                {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select className="flex-1 p-2.5 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm outline-none" value={h2hP2} onChange={(e) => setH2hP2(e.target.value)}>
                <option value="">선수 B</option>
                {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <button className="w-full bg-gray-900 dark:bg-gray-700 text-white font-bold py-2.5 rounded-xl text-sm active:opacity-80" onClick={fetchH2H}>
              전적 검색
            </button>

            {h2hRecords.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                <div className="text-xs text-gray-500 mb-2 font-medium">총 {h2hRecords.length}번의 맞대결 기록</div>
                {h2hRecords.map(r => (
                  <div key={r.id} className="py-2 text-sm flex justify-between items-center border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                    <div className="font-semibold text-xs">
                      <span className="text-blue-500">{r.winner_names.join(', ')}</span> 승
                      <span className="text-gray-300 mx-1.5">VS</span>
                      <span className="text-red-500">{r.loser_names.join(', ')}</span> 패
                    </div>
                    <div className="text-[11px] text-gray-400">{r.game_type} {r.target_score ? `(${r.target_score}점 게임)` : ''}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm">
            <h3 className="font-bold text-lg mb-4">🏆 명예의 전당</h3>
            {players.length === 0 ? (
              <p className="text-center text-gray-400 py-10">등록된 선수가 없습니다.</p>
            ) : (
              players.map((p, idx) => {
                const total = p.wins + p.losses;
                const rate = total > 0 ? Math.round((p.wins / total) * 100) : 0;
                return (
                  <div key={p.id} className="flex items-center py-4 border-b border-gray-50 dark:border-gray-700 last:border-0">
                    <div className={`w-8 font-bold text-lg ${idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-gray-400' : idx === 2 ? 'text-amber-600' : 'text-gray-300'}`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-base">{p.name} {p.billiard_handicap && <span className="text-sm font-normal text-gray-400">({p.billiard_handicap})</span>}</div>
                      <div className="text-xs text-gray-500">{p.wins}승 {p.losses}패 (승률 {rate}%)</div>
                    </div>
                    <div className="font-bold text-lg text-blue-500">{p.score}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 탭 3: 최근 기록 (타임라인) */}
        <div className={activeTab === 'history' ? 'block' : 'hidden'}>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm min-h-[60vh]">
            <h3 className="font-bold text-lg mb-4">📜 경기 타임라인</h3>
            {matches.length === 0 ? (
              <p className="text-center text-gray-400 py-10">최근 기록이 없습니다.</p>
            ) : (
              matches.map(m => {
                const isRecent = (new Date().getTime() - new Date(m.match_date).getTime()) < 10 * 60 * 1000;
                return (
                  <div key={m.id} className="py-4 border-b border-gray-50 dark:border-gray-700 last:border-0">
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-semibold text-sm">
                        <span className="text-blue-500">{m.winner_names.join(', ')}</span> 승
                        <span className="text-gray-300 mx-2 text-xs">VS</span>
                        <span className="text-red-500">{m.loser_names.join(', ')}</span> 패
                      </div>
                      {isRecent && (
                        <div className="flex gap-1">
                          <button onClick={() => startEditMatch(m)} className="text-xs bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-1 rounded">수정</button>
                          <button onClick={() => handleUndo(m.id)} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded">취소</button>
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(m.match_date).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 
                      <span className="mx-1">·</span> {m.game_type} {m.target_score ? `(${m.target_score}점 게임)` : ''} ({m.match_format}) 
                      <span className="mx-1">·</span> {m.match_type} {m.elo_change > 0 ? `(+${m.elo_change}점)` : ''}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white/90 dark:bg-gray-800/90 backdrop-blur-md flex justify-around py-3 pb-6 border-t border-gray-100 dark:border-gray-800 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
        {[
          { id: 'home', icon: '🏠', label: '홈' },
          { id: 'ranking', icon: '🏆', label: '랭킹' },
          { id: 'history', icon: '🕒', label: '기록' }
        ].map(tab => (
          <div key={tab.id} className={`flex-1 text-center cursor-pointer ${activeTab === tab.id ? 'opacity-100' : 'opacity-40'}`} onClick={() => setActiveTab(tab.id)}>
            <div className="text-2xl mb-1">{tab.icon}</div>
            <div className={`text-xs font-bold ${activeTab === tab.id ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>{tab.label}</div>
          </div>
        ))}
      </nav>

      <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-full text-sm shadow-xl transition-all duration-300 z-50 ${toast.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        {toast.message}
      </div>
    </div>
  );
}