require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.set('trust proxy', true);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 🛠 데이터베이스 컬럼 자동 동기화 함수
async function ensureDatabaseColumns() {
  try {
    await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS winner_target_scores INT[] DEFAULT ARRAY[]::INT[];`);
    await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS loser_target_scores INT[] DEFAULT ARRAY[]::INT[];`);
    console.log('✅ 데이터베이스 스키마 자동 동기화 완료');
  } catch (err) {
    console.error('⚠️ 스키마 자동 동기화 중 오류 발생:', err.message);
  }
}

const frontendDistPath = path.resolve(__dirname, '../frontend/dist');
console.log('📁 정적 파일 경로:', frontendDistPath);
app.use(express.static(frontendDistPath));

async function verifyPassword(university_code, plainPassword) {
  const result = await pool.query('SELECT shared_password FROM universities WHERE code = $1', [university_code]);
  if (result.rows.length === 0) return false;
  return await bcrypt.compare(plainPassword, result.rows[0].shared_password);
}

// 1. 선수 목록 불러오기
app.get('/api/:university_code/players', async (req, res) => {
  const { university_code } = req.params;
  try {
    const result = await pool.query(
      'SELECT id, name, billiard_handicap, score, wins, losses FROM players WHERE university_code = $1 ORDER BY score DESC, wins DESC',
      [university_code]
    );
    res.json({ success: true, players: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: '선수 목록을 불러오지 못했습니다.' });
  }
});

// 2. 선수 등록
app.post('/api/:university_code/players', async (req, res) => {
  const { university_code } = req.params;
  const { name, handicap } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO players (university_code, name, billiard_handicap) VALUES ($1, $2, $3) RETURNING id, name, billiard_handicap, score',
      [university_code, name, handicap || null]
    );
    res.json({ success: true, player: result.rows[0] });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(400).json({ success: false, error: '이미 등록된 이름입니다.' });
    }
    res.status(500).json({ success: false, error: '선수 등록에 실패했습니다.' });
  }
});

// 3. 전적 기록 추가
app.post('/api/:university_code/matches', async (req, res) => {
  const { university_code } = req.params;
  const { winner_ids, loser_ids, game_type, match_format, match_type, winner_target_scores, loser_target_scores, password } = req.body;
  const ip_address = req.ip;
  const user_agent = req.headers['user-agent'];

  const hasOverlap = winner_ids.some(id => loser_ids.includes(id));
  if (hasOverlap) return res.status(400).json({ success: false, error: '승자와 패자에 같은 선수가 들어갈 수 없습니다.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const isMatch = await verifyPassword(university_code, password || '1234');
    if (!isMatch) throw new Error('WRONG_PASSWORD');

    let elo_change = 0;
    if (match_format === '1:1' && match_type === '승급전') {
      const wId = winner_ids[0];
      const lId = loser_ids[0];
      
      const playersRes = await client.query('SELECT id, score FROM players WHERE id = ANY($1::int[])', [[wId, lId]]);
      const winner = playersRes.rows.find(p => p.id === wId);
      const loser = playersRes.rows.find(p => p.id === lId);
      
      if (!winner || !loser) throw new Error('PLAYER_NOT_FOUND');

      const K = 32;
      const expectedWinner = 1 / (1 + Math.pow(10, (loser.score - winner.score) / 400));
      elo_change = Math.round(K * (1 - expectedWinner));
    }

    await client.query('UPDATE players SET score = score + $1, wins = wins + 1 WHERE id = ANY($2::int[])', [elo_change, winner_ids]);
    await client.query('UPDATE players SET score = score - $1, losses = losses + 1 WHERE id = ANY($2::int[])', [elo_change, loser_ids]);

    await client.query(
      `INSERT INTO matches (university_code, game_type, match_format, match_type, winner_ids, loser_ids, elo_change, winner_target_scores, loser_target_scores, ip_address, user_agent) 
       VALUES ($1, $2, $3, $4, $5::int[], $6::int[], $7, $8::int[], $9::int[], $10, $11)`,
      [university_code, game_type, match_format, match_type, winner_ids, loser_ids, elo_change, winner_target_scores || [], loser_target_scores || [], ip_address, user_agent]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: '전적이 성공적으로 기록되었습니다.' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    if (err.message === 'WRONG_PASSWORD') return res.status(401).json({ success: false, error: '비밀번호가 틀렸습니다.' });
    if (err.message === 'PLAYER_NOT_FOUND') return res.status(404).json({ success: false, error: '선수를 찾을 수 없습니다.' });
    res.status(500).json({ success: false, error: '전적 기록에 실패했습니다.' });
  } finally {
    client.release();
  }
});

// 4. 전적 취소 (Soft Delete)
app.delete('/api/:university_code/matches/:id', async (req, res) => {
  const { university_code, id } = req.params;
  const { password } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const isMatch = await verifyPassword(university_code, password);
    if (!isMatch) throw new Error('WRONG_PASSWORD');

    const matchRes = await client.query(
      `SELECT * FROM matches WHERE id = $1 AND university_code = $2 AND is_deleted = FALSE AND match_date >= NOW() - INTERVAL '10 minutes'`,
      [id, university_code]
    );

    if (matchRes.rows.length === 0) throw new Error('CANNOT_UNDO');
    const match = matchRes.rows[0];

    await client.query('UPDATE players SET score = score - $1, wins = wins - 1 WHERE id = ANY($2::int[])', [match.elo_change, match.winner_ids]);
    await client.query('UPDATE players SET score = score + $1, losses = losses - 1 WHERE id = ANY($2::int[])', [match.elo_change, match.loser_ids]);
    await client.query('UPDATE matches SET is_deleted = TRUE WHERE id = $1', [id]);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.message === 'WRONG_PASSWORD') return res.status(401).json({ success: false, error: '비밀번호가 틀렸습니다.' });
    if (err.message === 'CANNOT_UNDO') return res.status(400).json({ success: false, error: '취소 기한(10분)이 지났거나 없는 기록입니다.' });
    res.status(500).json({ success: false, error: '취소 실패' });
  } finally {
    client.release();
  }
});

// 4-1. 전적 수정 (10분 이내)
app.put('/api/:university_code/matches/:id', async (req, res) => {
  const { university_code, id } = req.params;
  const { winner_ids, loser_ids, game_type, match_format, match_type, winner_target_scores, loser_target_scores, password } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const isMatch = await verifyPassword(university_code, password || '1234');
    if (!isMatch) throw new Error('WRONG_PASSWORD');

    const matchRes = await client.query(
      `SELECT * FROM matches WHERE id = $1 AND university_code = $2 AND is_deleted = FALSE AND match_date >= NOW() - INTERVAL '10 minutes'`,
      [id, university_code]
    );
    if (matchRes.rows.length === 0) throw new Error('CANNOT_EDIT');
    const oldMatch = matchRes.rows[0];

    await client.query('UPDATE players SET score = score - $1, wins = wins - 1 WHERE id = ANY($2::int[])', [oldMatch.elo_change, oldMatch.winner_ids]);
    await client.query('UPDATE players SET score = score + $1, losses = losses - 1 WHERE id = ANY($2::int[])', [oldMatch.elo_change, oldMatch.loser_ids]);

    let elo_change = 0;
    if (match_format === '1:1' && match_type === '승급전') {
      const wId = winner_ids[0];
      const lId = loser_ids[0];
      const playersRes = await client.query('SELECT id, score FROM players WHERE id = ANY($1::int[])', [[wId, lId]]);
      const winner = playersRes.rows.find(p => p.id === wId);
      const loser = playersRes.rows.find(p => p.id === lId);
      if (winner && loser) {
        const K = 32;
        const expectedWinner = 1 / (1 + Math.pow(10, (loser.score - winner.score) / 400));
        elo_change = Math.round(K * (1 - expectedWinner));
      }
    }

    await client.query('UPDATE players SET score = score + $1, wins = wins + 1 WHERE id = ANY($2::int[])', [elo_change, winner_ids]);
    await client.query('UPDATE players SET score = score - $1, losses = losses + 1 WHERE id = ANY($2::int[])', [elo_change, loser_ids]);

    await client.query(
      `UPDATE matches SET game_type = $1, match_format = $2, match_type = $3, winner_ids = $4::int[], loser_ids = $5::int[], elo_change = $6, winner_target_scores = $7::int[], loser_target_scores = $8::int[] WHERE id = $9`,
      [game_type, match_format, match_type, winner_ids, loser_ids, elo_change, winner_target_scores || [], loser_target_scores || [], id]
    );

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.message === 'WRONG_PASSWORD') return res.status(401).json({ success: false, error: '비밀번호가 틀렸습니다.' });
    if (err.message === 'CANNOT_EDIT') return res.status(400).json({ success: false, error: '수정 기한(10분)이 지났거나 없는 기록입니다.' });
    res.status(500).json({ success: false, error: '수정 실패' });
  } finally {
    client.release();
  }
});

// 5. 최근 전적 조회
app.get('/api/:university_code/matches', async (req, res) => {
  const { university_code } = req.params;
  try {
    const matchRes = await pool.query(
      `SELECT id, game_type, match_format, match_type, winner_ids, loser_ids, elo_change, winner_target_scores, loser_target_scores, match_date
       FROM matches WHERE university_code = $1 AND is_deleted = FALSE
       ORDER BY match_date DESC LIMIT 50`,
      [university_code]
    );
    
    const playerRes = await pool.query(
      `SELECT id, name, billiard_handicap FROM players WHERE university_code = $1`,
      [university_code]
    );
    
    const playerMap = {};
    playerRes.rows.forEach(p => {
      playerMap[p.id] = p.name;
    });

    const matchesWithDetails = matchRes.rows.map(m => ({
      ...m,
      winners: m.winner_ids.map((id, idx) => ({
        id,
        name: playerMap[id] || '알수없음',
        target_score: m.winner_target_scores?.[idx] ?? null
      })),
      losers: m.loser_ids.map((id, idx) => ({
        id,
        name: playerMap[id] || '알수없음',
        target_score: m.loser_target_scores?.[idx] ?? null
      }))
    }));

    res.json({ success: true, matches: matchesWithDetails });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: '전적을 불러오지 못했습니다.' });
  }
});

// 6. 상대 전적 조회 API
app.get('/api/:university_code/head-to-head', async (req, res) => {
  const { university_code } = req.params;
  const { p1, p2 } = req.query;
  try {
    const matchRes = await pool.query(
      `SELECT id, game_type, match_format, match_type, winner_ids, loser_ids, elo_change, winner_target_scores, loser_target_scores, match_date
       FROM matches 
       WHERE university_code = $1 AND is_deleted = FALSE 
       AND (
         (winner_ids @> ARRAY[$2::int] AND loser_ids @> ARRAY[$3::int]) OR 
         (winner_ids @> ARRAY[$3::int] AND loser_ids @> ARRAY[$2::int])
       )
       ORDER BY match_date DESC`,
      [university_code, p1, p2]
    );

    const playerRes = await pool.query(`SELECT id, name FROM players WHERE university_code = $1`, [university_code]);
    const playerMap = {};
    playerRes.rows.forEach(p => {
      playerMap[p.id] = p.name;
    });

    let p1Wins = 0;
    let p2Wins = 0;

    const records = matchRes.rows.map(m => {
      const isP1Winner = m.winner_ids.includes(Number(p1));
      if (isP1Winner) p1Wins++;
      else p2Wins++;

      return {
        ...m,
        winners: m.winner_ids.map((id, idx) => ({
          id,
          name: playerMap[id] || '알수없음',
          target_score: m.winner_target_scores?.[idx] ?? null
        })),
        losers: m.loser_ids.map((id, idx) => ({
          id,
          name: playerMap[id] || '알수없음',
          target_score: m.loser_target_scores?.[idx] ?? null
        }))
      };
    });

    res.json({ 
      success: true, 
      summary: {
        total: records.length,
        p1Wins,
        p2Wins
      },
      records 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: '상대 전적을 불러오지 못했습니다.' });
  }
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

// 🚀 데이터베이스 테이블 생성이 끝난 후에만 서버가 요청을 받도록 설정 (핵심 수정)
async function startServer() {
  await ensureDatabaseColumns();
  app.listen(port, () => console.log(`Server is running on http://localhost:${port}`));
}

startServer();