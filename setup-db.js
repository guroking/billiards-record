require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function setupDatabase() {
  try {
    console.log('데이터베이스 세팅을 시작합니다...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS universities (
          code VARCHAR(20) PRIMARY KEY,
          name VARCHAR(50) NOT NULL,
          shared_password VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS players (
          id SERIAL PRIMARY KEY,
          university_code VARCHAR(20) REFERENCES universities(code),
          name VARCHAR(50) NOT NULL,
          score INT DEFAULT 1200,
          wins INT DEFAULT 0,
          losses INT DEFAULT 0,
          UNIQUE(university_code, name)
      );
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS matches (
          id SERIAL PRIMARY KEY,
          university_code VARCHAR(20) REFERENCES universities(code),
          game_type VARCHAR(20) DEFAULT '4구',
          winner_id INT REFERENCES players(id),
          loser_id INT REFERENCES players(id),
          match_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          ip_address VARCHAR(50),
          user_agent TEXT,
          is_deleted BOOLEAN DEFAULT FALSE
      );
    `);

    // 모든 대학교의 초기 공용 비밀번호는 '1234'로 통일
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash('1234', saltRounds);

    const universities = [
        { code: 'kmou', name: '한국해양대학교' },
        { code: 'dmu', name: '동양미래대학교' },
        { code: 'yuhan', name: '유한대학교' },
        { code: 'dankook', name: '단국대학교' },
        { code: 'cbnu', name: '충북대학교' }
    ];

    for (const uni of universities) {
        // 이미 있는 대학교는 무시하고(ON CONFLICT DO NOTHING), 새로운 대학교만 추가합니다.
        await pool.query(`
          INSERT INTO universities (code, name, shared_password) 
          VALUES ($1, $2, $3)
          ON CONFLICT (code) DO NOTHING;
        `, [uni.code, uni.name, hashedPassword]);
    }
    
    console.log('✅ 5개 대학교 데이터 업데이트 완료 (초기 비밀번호: 1234)');
    console.log('🎉 모든 데이터베이스 세팅이 성공적으로 끝났습니다!');

  } catch (err) {
    console.error('❌ 데이터베이스 세팅 중 오류 발생:', err);
  } finally {
    await pool.end();
  }
}

setupDatabase();