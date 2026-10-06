import { useState, useEffect } from 'react';

// 백엔드 서버 주소 (로컬 테스트용)
const API_BASE = import.meta.env.DEV ? 'http://localhost:3000' : '';

const UNI_NAMES = {
  mmu: '목포해양대',
  dmu: '동양미래대',
  yuhan: '유한대',
  dankook: '단국대',
  cbnu: '충북대'
};

export default function App() {
  const [uniCode, setUniCode] = useState('');
  const [activeTab, setActiveTab] = useState('home');
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [toast, setToast] = useState({ visible: false, message: '' });

  // 선수 등록 상태
  const [regName, setRegName] = useState('');
  const [regHandicap, setRegHandicap] = useState('');

  // 경기 기록 상태
  const [matchFormat, setMatchFormat] = useState('1:1');
  const [matchType, setMatchType] = useState('승급전');
  const [gameType, setGameType] = useState('4구');
  const [winners, setWinners] = useState(['']);
  const [losers, setLosers] = useState(['']);
  const [password, setPassword] = useState('');

  // URL 파라미터 확인 (대학교 코드가 있는지)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uni = params.get('uni');
    if (uni && UNI_NAMES[uni]) {
      setUniCode(uni);
      fetchData(uni);
    }
  }, []);

  // 토스트 메시지 띄우기
  const showToast = (msg) => {
    setToast({ visible: true, message: msg });
    setTimeout(() => setToast({ visible: false, message: '' }), 3000);
  };

  // 데이터 불러오기
  const fetchData = async (code) => {
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

  // 선수 등록 API 호출
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

  // 경기 포맷(인원) 변경 시 배열 길이 조절 및 승급전 제한 
  const handleFormatChange = (e) => {
    const format = e.target.value;
    setMatchFormat(format);

    if (format === '1:1') {
      setWinners(['']); setLosers(['']);
    } else if (format === '2:2') {
      setWinners(['', '']); setLosers(['', '']);
      setMatchType('일반내기'); // 다인전은 승급전 불가
    } else if (format === '1:1:1') {
      setWinners(['']); setLosers(['', '']);
      setMatchType('일반내기'); // 다인전은 승급전 불가
    }
  };

  // 배열 특정 인덱스 업데이트
  const updateArray = (setter, array, index, value) => {
    const newArr = [...array];
    newArr[index] = value;
    setter(newArr);
  };

  // 경기 기록 API 호출
  const handleRecordMatch = async () => {
    if (winners.includes('') || losers.includes('')) return showToast('모든 선수를 선택해주세요.');

    try {
      const res = await fetch(`${API_BASE}/api/${uniCode}/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winner_ids: winners.map(Number),
          loser_ids: losers.map(Number),
          game_type: gameType,
          match_format: matchFormat,
          match_type: matchType,
          password: password || '1234'
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('경기 결과가 저장되었습니다! 🏆');
        setWinners(winners.map(() => ''));
        setLosers(losers.map(() => ''));
        setPassword('');
        fetchData(uniCode);
      } else {
        showToast(data.error);
      }
    } catch (err) {
      showToast('서버 통신 오류');
    }
  };

  // 기록 취소 (Undo) API 호출
  const handleUndo = async (matchId) => {
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

  // ---------------- 화면 렌더링 함수들 ----------------

  if (!uniCode) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold mb-6 text-gray-900">🎱 당구 전적판</h1>
          <select
            className="w-full p-4 mb-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none"
            id="uni-select"
          >
            {Object.entries(UNI_NAMES).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
          <button
            className="w-full bg-blue-500 text-white font-bold p-4 rounded-xl active:bg-blue-600 transition"
            onClick={() => window.location.href = `/?uni=${document.getElementById('uni-select').value}`}
          >
            입장하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 pb-24 font-sans">

      {/* 상단 헤더 */}
      <header className="p-6 flex justify-between items-center sticky top-0 bg-gray-50/90 dark:bg-gray-900/90 backdrop-blur-md z-10">
        <h1 className="text-2xl font-bold tracking-tight">{UNI_NAMES[uniCode]} 전적판</h1>
        <a href="/" className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400">학교 변경</a>
      </header>

      <main className="max-w-md mx-auto px-4">

        {/* 탭 1: 홈 (경기 기록 & 선수 등록) */}
        <div className={activeTab === 'home' ? 'block' : 'hidden'}>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm mb-4">
            <h3 className="font-bold text-lg mb-4">⚔️ 경기 결과 기록</h3>

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
                <select key={`w-${idx}`} className="w-full p-3 mb-2 bg-white dark:bg-gray-800 rounded-xl outline-none" value={val} onChange={(e) => updateArray(setWinners, winners, idx, e.target.value)}>
                  <option value="">선수 선택</option>
                  {players.map(p => <option key={p.id} value={p.id}>{p.name} {p.billiard_handicap && `(${p.billiard_handicap})`}</option>)}
                </select>
              ))}

              <div className="text-center font-black text-gray-300 dark:text-gray-500 my-2">VS</div>

              <div className="text-sm font-bold text-red-500 mb-2">💀 패배 선수 ({losers.length}명)</div>
              {losers.map((val, idx) => (
                <select key={`l-${idx}`} className="w-full p-3 mb-2 bg-white dark:bg-gray-800 rounded-xl outline-none" value={val} onChange={(e) => updateArray(setLosers, losers, idx, e.target.value)}>
                  <option value="">선수 선택</option>
                  {players.map(p => <option key={p.id} value={p.id}>{p.name} {p.billiard_handicap && `(${p.billiard_handicap})`}</option>)}
                </select>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <select className="col-span-1 p-3 bg-gray-100 dark:bg-gray-700 rounded-xl outline-none w-full" value={gameType} onChange={(e) => setGameType(e.target.value)}>
                <option value="4구">4구</option>
                <option value="3쿠션">3쿠션</option>
                <option value="포켓볼">포켓볼</option>
              </select>
              <input type="password" placeholder="기본: 1234" className="col-span-2 p-3 bg-gray-100 dark:bg-gray-700 rounded-xl outline-none w-full placeholder:text-gray-400" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            <button className="w-full bg-blue-500 text-white font-bold p-4 rounded-xl active:bg-blue-600" onClick={handleRecordMatch}>
              결과 저장하기
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

        {/* 탭 2: 랭킹 */}
        <div className={activeTab === 'ranking' ? 'block' : 'hidden'}>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm min-h-[60vh]">
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
                const isRecent = (new Date() - new Date(m.match_date)) < 10 * 60 * 1000;
                return (
                  <div key={m.id} className="py-4 border-b border-gray-50 dark:border-gray-700 last:border-0">
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-semibold">
                        <span className="text-blue-500">{m.winner_names.join(', ')}</span> 승
                        <span className="text-gray-300 mx-2 text-xs">VS</span>
                        <span className="text-red-500">{m.loser_names.join(', ')}</span> 패
                      </div>
                      {isRecent && (
                        <button onClick={() => handleUndo(m.id)} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded">실수 취소</button>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(m.match_date).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      <span className="mx-1">·</span> {m.game_type} ({m.match_format})
                      <span className="mx-1">·</span> {m.match_type} {m.elo_change > 0 ? `(+${m.elo_change}점)` : ''}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* 하단 네비게이션 탭 */}
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

      {/* 토스트 알림 */}
      <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-full text-sm shadow-xl transition-all duration-300 z-50 ${toast.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        {toast.message}
      </div>
    </div>
  );
}