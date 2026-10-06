require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.set('trust proxy', true);

// 정적 파일 제공
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

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
      'SELECT id, name, score, wins, losses FROM players WHERE university_code = $1 ORDER BY score DESC, wins DESC',
      [university_code]
    );
    res.json({ success: true, players: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: '선수 목록을 불러오지 못했습니다.' });
  }
});

// 2. 선수 등록 API (비밀번호 검증 제거 - 이름만으로 초간편 등록)
app.post('/api/:university_code/players', async (req, res) => {
  const { university_code } = req.params;
  const { name } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO players (university_code, name) VALUES ($1, $2) RETURNING id, name, score',
      [university_code, name]
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

// 3. 전적 기록 API (여기는 공용 비밀번호 유지)
app.post('/api/:university_code/matches', async (req, res) => {
  const { university_code } = req.params;
  const { winner_id, loser_id, game_type = '4구', password } = req.body;
  const ip_address = req.ip;
  const user_agent = req.headers['user-agent'];

  if (winner_id === loser_id) {
    return res.status(400).json({ success: false, error: '승자와 패자는 같을 수 없습니다.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const isMatch = await verifyPassword(university_code, password);
    if (!isMatch) throw new Error('WRONG_PASSWORD');

    const playersRes = await client.query(
      'SELECT id, score FROM players WHERE id IN ($1, $2)',
      [winner_id, loser_id]
    );
    const winner = playersRes.rows.find(p => p.id === winner_id);
    const loser = playersRes.rows.find(p => p.id === loser_id);

    if (!winner || !loser) throw new Error('PLAYER_NOT_FOUND');

    const K = 32;
    const expectedWinner = 1 / (1 + Math.pow(10, (loser.score - winner.score) / 400));
    const expectedLoser = 1 / (1 + Math.pow(10, (winner.score - loser.score) / 400));
    
    const newWinnerScore = Math.round(winner.score + K * (1 - expectedWinner));
    const newLoserScore = Math.round(loser.score + K * (0 - expectedLoser));

    await client.query(
      'UPDATE players SET score = $1, wins = wins + 1 WHERE id = $2',
      [newWinnerScore, winner_id]
    );
    await client.query(
      'UPDATE players SET score = $1, losses = losses + 1 WHERE id = $2',
      [newLoserScore, loser_id]
    );

    await client.query(
      `INSERT INTO matches (university_code, game_type, winner_id, loser_id, ip_address, user_agent) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [university_code, game_type, winner_id, loser_id, ip_address, user_agent]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: '전적이 성공적으로 기록되었습니다.' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    if (err.message === 'WRONG_PASSWORD') {
      return res.status(401).json({ success: false, error: '비밀번호가 틀렸습니다.' });
    }
    if (err.message === 'PLAYER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: '선수를 찾을 수 없습니다.' });
    }
    res.status(500).json({ success: false, error: '전적 기록에 실패했습니다.' });
  } finally {
    client.release();
  }
});

// 4. 최근 전적 조회
app.get('/api/:university_code/matches', async (req, res) => {
  const { university_code } = req.params;
  try {
    const result = await pool.query(
      `SELECT m.id, m.game_type, m.match_date, 
              w.name AS winner_name, l.name AS loser_name,
              w.score AS winner_score, l.score AS loser_score
       FROM matches m
       JOIN players w ON m.winner_id = w.id
       JOIN players l ON m.loser_id = l.id
       WHERE m.university_code = $1 AND m.is_deleted = FALSE
       ORDER BY m.match_date DESC LIMIT 50`,
      [university_code]
    );
    res.json({ success: true, matches: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: '전적을 불러오지 못했습니다.' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});