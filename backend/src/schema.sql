-- PostgreSQL / PostGIS 示例表结构（后续可迁移真实数据库）
CREATE TABLE IF NOT EXISTS poi (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(64),
  level VARCHAR(16),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  open_status VARCHAR(16) DEFAULT 'OPEN',
  ticket_remain INTEGER DEFAULT 0,
  crowd_level DOUBLE PRECISION DEFAULT 0,
  best_visit_time VARCHAR(64),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
