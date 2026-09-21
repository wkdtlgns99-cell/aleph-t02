/**
 * Quilltale: 8-Bit Turn-Based Battle
 * Storage & Corruption Recovery Module (T02-C22 ~ C25)
 */

const STORAGE_KEY = 'quilltale_battle_save_v1';

// 기본 보존 기록 규격 (T02-C24 기본값 선언)
const DEFAULT_STORAGE = {
  version: 1,
  totalPlays: 0,
  totalWins: 0,
  totalLosses: 0,
  bestClearTime: null, // 초 단위 (예: 18.4)
  soundEnabled: true,
  reducedMotion: false,
  lastPlayedAt: null
};

class GameStorage {
  constructor() {
    this.data = this.loadSafe();
  }

  /**
   * localStorage에서 데이터를 안전하게 불러오기
   * - 빈 값(null/undefined/빈문자열) 처리 (T02-C24)
   * - 손상된 JSON 또는 유효하지 않은 스키마 자동 복구 (T02-C25)
   */
  loadSafe() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw || raw.trim() === '') {
        // T02-C24: 빈 저장값에서도 기본값으로 시작
        return { ...DEFAULT_STORAGE };
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) {
        console.warn('[Storage] 유효하지 않은 데이터 구조 감지. 기본값으로 복구합니다.');
        return { ...DEFAULT_STORAGE };
      }

      // 스키마 누락 필드 병합 복구
      return {
        ...DEFAULT_STORAGE,
        totalPlays: Number.isInteger(parsed.totalPlays) && parsed.totalPlays >= 0 ? parsed.totalPlays : 0,
        totalWins: Number.isInteger(parsed.totalWins) && parsed.totalWins >= 0 ? parsed.totalWins : 0,
        totalLosses: Number.isInteger(parsed.totalLosses) && parsed.totalLosses >= 0 ? parsed.totalLosses : 0,
        bestClearTime: typeof parsed.bestClearTime === 'number' && parsed.bestClearTime > 0 ? parsed.bestClearTime : null,
        soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
        reducedMotion: typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : false,
        lastPlayedAt: parsed.lastPlayedAt || null
      };
    } catch (err) {
      // T02-C25: 손상된 저장값(파싱 실패) 시 중단 없이 기본값으로 자동 복구
      console.warn('[Storage] 손상된 JSON 감지, 기본값으로 안전 복구:', err);
      return { ...DEFAULT_STORAGE };
    }
  }

  /**
   * 현재 상태를 localStorage에 영구 보존 (T02-C23)
   */
  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('[Storage] 저장 실패(시크릿 모드 용량 제한 등):', e);
    }
  }

  /**
   * 경기 결과 기록 갱신 (보존 기록만 갱신, 현재 판 상태와 엄격히 분리)
   */
  recordGameResult(isWin, clearTimeSeconds = null) {
    this.data.totalPlays += 1;
    if (isWin) {
      this.data.totalWins += 1;
      if (clearTimeSeconds !== null) {
        if (this.data.bestClearTime === null || clearTimeSeconds < this.data.bestClearTime) {
          this.data.bestClearTime = parseFloat(clearTimeSeconds.toFixed(1));
        }
      }
    } else {
      this.data.totalLosses += 1;
    }
    this.data.lastPlayedAt = new Date().toISOString();
    this.save();
  }

  setSoundEnabled(enabled) {
    this.data.soundEnabled = Boolean(enabled);
    this.save();
  }

  setReducedMotion(reduced) {
    this.data.reducedMotion = Boolean(reduced);
    this.save();
  }

  /**
   * 검사관/사용자 검증용: 고의로 손상된 데이터 주입 (T02-C25 검증 도구)
   */
  corruptForTest() {
    try {
      localStorage.setItem(STORAGE_KEY, 'CORRUPTED_JSON_{{invalid@@@999');
    } catch (e) {}
    this.data = this.loadSafe();
    return this.data;
  }

  /**
   * 모든 보존 기록 완전 초기화
   */
  resetAll() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    this.data = { ...DEFAULT_STORAGE };
    return this.data;
  }
}

// 전역 싱글톤 인스턴스
window.gameStorage = new GameStorage();
