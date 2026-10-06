require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Render 외부 접속 시 필수
  }
});

async function setupDatabase() {
  try {
    console.log('데이터베이스 2.0 리뉴얼 세팅을 시작합니다...');

    // 1. 기존 테이블 싹 지우기 (초기화)
    await pool.query(`DROP TABLE IF EXISTS matches CASCADE;`);
    await pool.query(`DROP TABLE IF EXISTS players CASCADE;`);
    await pool.query(`DROP TABLE IF EXISTS universities CASCADE;`);
    console.log('🧹 기존 테이블 초기화 완료');

    // 2. 대학교 테이블 생성
    await pool.query(`
      CREATE TABLE universities (
          code VARCHAR(20) PRIMARY KEY,
          name VARCHAR(50) NOT NULL,
          shared_password VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ universities 테이블 생성 완료');

    // 3. 플레이어 테이블 생성 (수지 컬럼 추가)
    await pool.query(`
      CREATE TABLE players (
          id SERIAL PRIMARY KEY,
          university_code VARCHAR(20) REFERENCES universities(code),
          name VARCHAR(50) NOT NULL,
          billiard_handicap INT,                 -- 당구 수지 (선택 입력이므로 NULL 허용)
          score INT DEFAULT 1200,                -- 명예의 전당 점수
          wins INT DEFAULT 0,
          losses INT DEFAULT 0,
          UNIQUE(university_code, name)
      );
    `);
    console.log('✅ players(수지 포함) 테이블 생성 완료');

    // 4. 전적 기록 테이블 생성 (다인전 배열 및 경기 타입 추가)
    await pool.query(`
      CREATE TABLE matches (
          id SERIAL PRIMARY KEY,
          university_code VARCHAR(20) REFERENCES universities(code),
          
          game_type VARCHAR(20) DEFAULT '4구',     -- 4구, 3쿠션, 포켓볼
          match_format VARCHAR(20) NOT NULL,       -- '1:1', '2:2', '1:1:1' 등
          match_type VARCHAR(20) NOT NULL,         -- '승급전', '일반내기', '몰빵'
          
          winner_ids INTEGER[] NOT NULL,           -- 승자 ID를 배열로 저장 (여러 명 가능)
          loser_ids INTEGER[] NOT NULL,            -- 패자 ID를 배열로 저장 (여러 명 가능)
          
          elo_change INT DEFAULT 0,                -- 변동된 명예의 전당 점수 (취소 기능을 위해 저장)
          match_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          ip_address VARCHAR(50),
          user_agent TEXT,
          is_deleted BOOLEAN DEFAULT FALSE
      );
    `);
    console.log('✅ matches(다인전/승급전 지원) 테이블 생성 완료');

    // 5. 5개 대학교 기초 데이터 인서트
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash('1234', saltRounds);

    const universities = [
        { code: 'mmu', name: '목포해양대학교' },
        { code: 'dmu', name: '동양미래대학교' },
        { code: 'yuhan', name: '유한대학교' },
        { code: 'dankook', name: '단국대학교' },
        { code: 'cbnu', name: '충북대학교' }
    ];

    for (const uni of universities) {
        await pool.query(`
          INSERT INTO universities (code, name, shared_password) 
          VALUES ($1, $2, $3)
        `, [uni.code, uni.name, hashedPassword]);
    }
    
    console.log('✅ 5개 대학교 데이터 세팅 완료 (초기 비밀번호: 1234)');
    console.log('🎉 당구 전적판 2.0 데이터베이스 세팅이 성공적으로 끝났습니다!');

  } catch (err) {
    console.error('❌ 데이터베이스 세팅 중 오류 발생:', err);
  } finally {
    await pool.end(); // 세팅 끝나면 DB 연결 종료
  }
}

setupDatabase();