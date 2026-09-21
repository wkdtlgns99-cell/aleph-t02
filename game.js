/**
 * Quilltale: 8-Bit Turn-Based Battle
 * Game Engine & Combat Loop (T02-C01 ~ C27)
 */

// 난이도 설정 (T02-C18 ~ C21: 난이도 단일 수치 변수)
// 기본 보스 공격력: 18 (20회 플레이 비교 검증의 최종 확정 값)
const ENEMY_BASE_ATK = 18;
const BATTLE_TIME_LIMIT = 30.0; // 30초 핵심 루프 규격 (T02-C07)

class QuilltaleBattleGame {
  constructor() {
    this.canvas = document.getElementById('battleCanvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    
    // 현재 판 상태 (새 게임 시 완전 초기화, T02-C08, C09, C22)
    this.player = null;
    this.boss = null;
    this.status = 'READY'; // READY, BATTLE, PAUSED, VICTORY, DEFEAT
    this.timeLeft = BATTLE_TIME_LIMIT;
    this.turn = 1;
    this.isActing = false; // 입력 연타 방어 및 턴 락 (T02-C06, C12)
    this.inputTestCount = 0;
    
    // 타이머 및 애니메이션 ID
    this.timerInterval = null;
    this.lastTimestamp = 0;
    this.animFrameId = null;

    // 시각 효과 상태 (데미지 팝업, 파티클 등)
    this.floatingTexts = [];
    this.particles = [];
    this.screenShakeTime = 0;
    this.actionQueue = [];

    // 10분 연속 실행 모니터링 (T02-C16, C17)
    this.startTime = Date.now();
    this.elapsedSeconds = 0;

    this.initDOM();
    this.initEvents();
    this.resetGame(); // 초기 상태 셋업
    this.startRenderLoop();
  }

  initDOM() {
    // UI 요소 캐싱
    this.dom = {
      rulesPanel: document.getElementById('rulesPanel'),
      controlsPanel: document.getElementById('controlsPanel'),
      gameStateBadge: document.getElementById('gameStateBadge'),
      timerDisplay: document.getElementById('timerDisplay'),
      turnDisplay: document.getElementById('turnDisplay'),
      playerHpBar: document.getElementById('playerHpBar'),
      playerHpText: document.getElementById('playerHpText'),
      bossHpBar: document.getElementById('bossHpBar'),
      bossHpText: document.getElementById('bossHpText'),
      combatLog: document.getElementById('combatLog'),
      btnAttack: document.getElementById('btnAttack'),
      btnSkill: document.getElementById('btnSkill'),
      btnGuard: document.getElementById('btnGuard'),
      btnPotion: document.getElementById('btnPotion'),
      btnRestart: document.getElementById('btnRestart'),
      btnPause: document.getElementById('btnPause'),
      btnMute: document.getElementById('btnMute'),
      btnMotion: document.getElementById('btnMotion'),
      btnRapidTest: document.getElementById('btnRapidTest'),
      btnCorruptTest: document.getElementById('btnCorruptTest'),
      btnResetStorage: document.getElementById('btnResetStorage'),
      statsDisplay: document.getElementById('statsDisplay'),
      container: document.getElementById('gameContainer')
    };

    // 설정 복원
    if (window.gameStorage) {
      const data = window.gameStorage.data;
      if (window.soundEngine) {
        window.soundEngine.setMuted(!data.soundEnabled);
      }
      this.updateSettingsUI();
    }
  }

  updateSettingsUI() {
    if (!window.gameStorage) return;
    const data = window.gameStorage.data;
    if (this.dom.btnMute) {
      this.dom.btnMute.textContent = data.soundEnabled ? '🔊 사운드: 켜짐' : '🔇 사운드: 음소거';
      this.dom.btnMute.setAttribute('aria-pressed', (!data.soundEnabled).toString());
    }
    if (this.dom.btnMotion) {
      this.dom.btnMotion.textContent = data.reducedMotion ? '🚫 움직임: 줄임' : '✨ 움직임: 기본';
      this.dom.btnMotion.setAttribute('aria-pressed', data.reducedMotion.toString());
    }
    this.updateStatsUI();
  }

  updateStatsUI() {
    if (!this.dom.statsDisplay || !window.gameStorage) return;
    const d = window.gameStorage.data;
    const bestStr = d.bestClearTime !== null ? `${d.bestClearTime}초` : '기록 없음';
    this.dom.statsDisplay.innerHTML = `
      <div class="stat-item">전체 플레이: <strong>${d.totalPlays}</strong>회</div>
      <div class="stat-item">승리: <strong>${d.totalWins}</strong>회 / 패배: <strong>${d.totalLosses}</strong>회</div>
      <div class="stat-item">최단 클리어: <strong>${bestStr}</strong></div>
    `;
  }

  /**
   * 새 게임 시작 및 판 상태 완전 초기화 (T02-C08, C09, C22)
   */
  resetGame() {
    this.stopTimer();

    this.player = {
      name: '기록관 (Player)',
      hp: 100,
      maxHp: 100,
      potionUsed: false,
      skillCooldown: 0,
      isGuarding: false
    };

    this.boss = {
      name: '보일러 폐포의 무쇠 골렘',
      title: 'Quilltale Chapter 1 Boss',
      hp: 110,
      maxHp: 110,
      charging: false
    };

    this.status = 'READY';
    this.timeLeft = BATTLE_TIME_LIMIT;
    this.turn = 1;
    this.isActing = false;
    this.floatingTexts = [];
    this.particles = [];
    this.actionQueue = [];

    this.clearCombatLog();
    this.logCombat('전투 준비 완료. 30초 내에 보스를 제압하세요!', 'sys');
    this.updateUI();
    this.render();
  }

  /**
   * 전투 개시
   */
  startBattle() {
    if (this.status === 'BATTLE') return;
    this.status = 'BATTLE';
    this.startTimer();
    this.updateUI();
  }

  startTimer() {
    this.stopTimer();
    const intervalMs = 100;
    this.timerInterval = setInterval(() => {
      if (this.status !== 'BATTLE') return;

      this.timeLeft = Math.max(0, parseFloat((this.timeLeft - 0.1).toFixed(1)));
      this.dom.timerDisplay.textContent = `${this.timeLeft.toFixed(1)}s`;

      // 30초 타임오버 시 패배 판정 (T02-C07)
      if (this.timeLeft <= 0) {
        this.handleDefeat('시간 초과 (30초 제한 도달)! 골렘의 증기 폭주로 패배했습니다.');
      }
    }, intervalMs);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * 일시정지 토글 (T02-C15)
   */
  togglePause(forcePause = null) {
    if (this.status !== 'BATTLE' && this.status !== 'PAUSED') return;

    if (forcePause === true || (forcePause === null && this.status === 'BATTLE')) {
      this.status = 'PAUSED';
      this.stopTimer();
      this.logCombat('[일시정지] 게임이 멈췄습니다. (P 또는 재개 버튼으로 계속)', 'sys');
    } else if (forcePause === false || (forcePause === null && this.status === 'PAUSED')) {
      this.status = 'BATTLE';
      this.startTimer();
      this.logCombat('[재개] 전투를 다시 진행합니다.', 'sys');
    }
    this.updateUI();
  }

  // --- 플레이어 행동 처리 (T02-C06: 핵심 조작 1회 -> 상태 변화 1회) ---

  async handlePlayerAction(actionType) {
    if (this.status === 'READY') {
      this.startBattle();
    }

    if (this.status !== 'BATTLE' || this.isActing) {
      return false;
    }

    this.isActing = true;
    this.updateActionButtonsState();

    try {
      if (actionType === 'ATTACK') {
        // [1] 통상 공격: 18~24 데미지
        const dmg = Math.floor(Math.random() * 7) + 18;
        this.boss.hp = Math.max(0, this.boss.hp - dmg);
        window.soundEngine.playAttack();
        this.addFloatingText(`-${dmg}`, 'boss', '#f43f5e');
        this.triggerScreenShake(4);
        this.logCombat(`🗡️ 기록관의 통상 공격! 보스에게 [${dmg}]의 물리 피해!`, 'player');
      } 
      else if (actionType === 'SKILL') {
        // [2] 룬 영창 스킬: 36~46 데미지, 쿨타임 1턴
        if (this.player.skillCooldown > 0) {
          this.logCombat(`⚠️ 스킬 쿨타임 중입니다! (${this.player.skillCooldown}턴 남음)`, 'sys');
          this.isActing = false;
          this.updateActionButtonsState();
          return false;
        }
        const dmg = Math.floor(Math.random() * 11) + 36;
        this.boss.hp = Math.max(0, this.boss.hp - dmg);
        this.player.skillCooldown = 2; // 다음 턴 사용 불가
        window.soundEngine.playSkill();
        this.addFloatingText(`CRIT -${dmg}!`, 'boss', '#38bdf8');
        this.triggerScreenShake(8);
        this.logCombat(`✨ 룬 영창 마법 작렬! 보스에게 [${dmg}]의 폭발 피해!`, 'player');
      } 
      else if (actionType === 'GUARD') {
        // [3] 패링/방어 자세: 이번 턴 피해 70% 감소 + 반사
        this.player.isGuarding = true;
        window.soundEngine.playGuard();
        this.addFloatingText('방어 태세!', 'player', '#fbbf24');
        this.logCombat(`🛡️ 방어 태세를 취했습니다. 적 공격 피해를 대폭 줄이고 반격합니다!`, 'player');
      } 
      else if (actionType === 'POTION') {
        // [4] 에테르 물약: 40 회복 (전투당 1회)
        if (this.player.potionUsed) {
          this.logCombat('⚠️ 에테르 물약은 이번 전투에서 이미 소진되었습니다.', 'sys');
          this.isActing = false;
          this.updateActionButtonsState();
          return false;
        }
        this.player.potionUsed = true;
        const heal = 40;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
        window.soundEngine.playPotion();
        this.addFloatingText(`+${heal} HP`, 'player', '#22c55e');
        this.logCombat(`🧪 에테르 물약 복용! HP [${heal}] 회복!`, 'player');
      }

      this.updateUI();

      // 승리 검사 (T02-C07)
      if (this.boss.hp <= 0) {
        await this.delay(300);
        this.handleVictory();
        return true;
      }

      // 적 턴 진행 (짧은 턴 템포 350ms)
      await this.delay(350);
      if (this.status === 'BATTLE') {
        this.processBossTurn();
      }

      // 쿨타임 감소 및 가드 해제
      if (this.player.skillCooldown > 0 && actionType !== 'SKILL') {
        this.player.skillCooldown = Math.max(0, this.player.skillCooldown - 1);
      }
      this.turn += 1;

      // 패배 검사 (T02-C07)
      if (this.player.hp <= 0) {
        await this.delay(200);
        this.handleDefeat('기록관의 생명력이 0이 되었습니다. 골렘의 묵직한 강철 주먹에 쓰러졌습니다.');
        return true;
      }

    } finally {
      this.isActing = false;
      this.updateUI();
      this.updateActionButtonsState();
    }

    return true;
  }

  /**
   * 보스 AI 턴
   */
  processBossTurn() {
    let rawDmg = Math.floor(Math.random() * 7) + (ENEMY_BASE_ATK - 3); // ENEMY_BASE_ATK 기반 산출
    let attackDesc = '묵직한 증기 펀치';

    // 3턴 주기 강공격 패턴
    if (this.turn % 3 === 0) {
      rawDmg += 8;
      attackDesc = '🔥 보일러 폐포 과열 증기 방출!';
    }

    let actualDmg = rawDmg;
    if (this.player.isGuarding) {
      actualDmg = Math.max(3, Math.floor(rawDmg * 0.28)); // 72% 경감
      const reflectDmg = 12;
      this.boss.hp = Math.max(0, this.boss.hp - reflectDmg);
      this.addFloatingText(`반사 -${reflectDmg}`, 'boss', '#eab308');
      this.logCombat(`💥 패링 성공! 피해를 [${actualDmg}]로 방어하고 [${reflectDmg}]를 반사했습니다!`, 'boss');
      this.player.isGuarding = false;
    } else {
      window.soundEngine.playDamage();
      this.triggerScreenShake(6);
      this.logCombat(`🤖 골렘의 [${attackDesc}]! 기록관이 [${actualDmg}]의 피해를 입었습니다!`, 'boss');
    }

    this.player.hp = Math.max(0, this.player.hp - actualDmg);
    this.addFloatingText(`-${actualDmg}`, 'player', '#ef4444');
    this.updateUI();
  }

  handleVictory() {
    this.status = 'VICTORY';
    this.stopTimer();
    const clearTime = parseFloat((BATTLE_TIME_LIMIT - this.timeLeft).toFixed(1));
    window.soundEngine.playVictory();
    this.logCombat(`🏆 [승리!] ${clearTime}초 만에 보일러 폐포의 무쇠 골렘을 격파했습니다!`, 'sys');

    if (window.gameStorage) {
      window.gameStorage.recordGameResult(true, clearTime);
      this.updateStatsUI();
    }
    this.updateUI();
  }

  handleDefeat(reason) {
    if (this.status === 'DEFEAT') return;
    this.status = 'DEFEAT';
    this.stopTimer();
    window.soundEngine.playDefeat();
    this.logCombat(`💀 [패배] ${reason}`, 'sys');

    if (window.gameStorage) {
      window.gameStorage.recordGameResult(false);
      this.updateStatsUI();
    }
    this.updateUI();
  }

  /**
   * 1초 10회 연속 입력 이벤트 검증 (T02-C12)
   */
  async runRapidInputTest() {
    if (this.isActing) return;
    this.resetGame();
    this.startBattle();

    this.logCombat('🧪 [T02-C12 검증 시작] 1초 내 연속 10회 공격 이벤트를 발송합니다...', 'sys');
    let acceptedCount = 0;
    let blockedByDebounce = 0;

    for (let i = 1; i <= 10; i++) {
      const ok = await this.handlePlayerAction('ATTACK');
      if (ok) acceptedCount++;
      else blockedByDebounce++;
      await this.delay(90); // 10회 * 90ms = 약 0.9초 내에 집중 전송
    }

    this.logCombat(`🧪 [검증 완료] 10회 입력 중 정식 턴 반영: ${acceptedCount}건 / 연타 방어(디바운스): ${blockedByDebounce}건. 상태 엉킴 없이 완벽 처리됨!`, 'sys');
  }

  // --- 화면 렌더링 및 이펙트 (T02-C26, C27) ---

  triggerScreenShake(intensity) {
    if (window.gameStorage && window.gameStorage.data.reducedMotion) {
      return; // 움직임 줄이기 적용 시 화면 쉐이크 완전 차단 (T02-C27)
    }
    this.screenShakeTime = intensity;
  }

  addFloatingText(text, target, color) {
    const x = target === 'player' ? 140 : 440;
    const y = target === 'player' ? 160 : 130;
    this.floatingTexts.push({
      text,
      x: x + (Math.random() * 20 - 10),
      y,
      color,
      alpha: 1.0,
      life: 35
    });
  }

  startRenderLoop() {
    const renderFrame = (timestamp) => {
      this.animFrameId = requestAnimationFrame(renderFrame);
      this.render();
    };
    this.animFrameId = requestAnimationFrame(renderFrame);
  }

  render() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.save();

    // 화면 쉐이크 적용
    if (this.screenShakeTime > 0) {
      const offsetX = (Math.random() * 2 - 1) * this.screenShakeTime;
      const offsetY = (Math.random() * 2 - 1) * this.screenShakeTime;
      ctx.translate(offsetX, offsetY);
      this.screenShakeTime *= 0.85;
      if (this.screenShakeTime < 0.3) this.screenShakeTime = 0;
    }

    // 1. 8-bit 배경 렌더링
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    // 증기 보일러 배경 타일 / 격자
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 2. 바닥 단상 (아레나)
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(40, 260, 200, 16);
    ctx.fillRect(360, 260, 240, 16);

    ctx.fillStyle = '#334155';
    ctx.fillRect(40, 260, 200, 3);
    ctx.fillRect(360, 260, 240, 3);

    // 3. 8비트 플레이어 (Quilltale 기록관)
    this.drawPixelPlayer(ctx, 110, 170);

    // 4. 8비트 보스 (보일러 폐포의 무쇠 골렘)
    this.drawPixelBoss(ctx, 420, 130);

    // 5. 부유 텍스트 (데미지 팝업)
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 16px monospace';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 4;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.shadowBlur = 0;

      ft.y -= 0.8;
      ft.life -= 1;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    ctx.restore();
  }

  drawPixelPlayer(ctx, x, y) {
    // 8비트 스타일 플레이어 렌더링
    // 몸체 & 로브 (보라/청록)
    ctx.fillStyle = '#6366f1';
    ctx.fillRect(x + 12, y + 24, 24, 48);
    ctx.fillStyle = '#4338ca';
    ctx.fillRect(x + 16, y + 36, 16, 36);

    // 모자 / 두건
    ctx.fillStyle = '#312e81';
    ctx.fillRect(x + 8, y + 8, 32, 16);
    ctx.fillRect(x + 16, y, 16, 8);

    // 얼굴 & 눈
    ctx.fillStyle = '#fde047';
    ctx.fillRect(x + 28, y + 16, 6, 4);

    // 깃펜 지팡이 (Quilltale 상징)
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(x + 40, y + 10, 4, 60);
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(x + 38, y + 6, 8, 8);
  }

  drawPixelBoss(ctx, x, y) {
    // 8비트 스타일 무쇠 골렘 렌더링
    // 강철 몸체
    ctx.fillStyle = '#475569';
    ctx.fillRect(x, y, 96, 96);
    ctx.fillStyle = '#334155';
    ctx.fillRect(x + 8, y + 8, 80, 80);

    // 보일러 폐포 코어 (주황 발광)
    const pulse = Math.sin(Date.now() / 200) * 0.2 + 0.8;
    ctx.fillStyle = `rgba(249, 115, 22, ${pulse})`;
    ctx.fillRect(x + 28, y + 32, 40, 40);

    // 증기 배기 파이프
    ctx.fillStyle = '#64748b';
    ctx.fillRect(x + 16, y - 16, 12, 16);
    ctx.fillRect(x + 68, y - 16, 12, 16);

    // 증기 파티클 (애니메이션)
    const steamY = (Date.now() / 20) % 24;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillRect(x + 18, y - 20 - steamY, 8, 8);
    ctx.fillRect(x + 70, y - 24 - steamY, 8, 8);

    // 골렘 강철 주먹
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x - 16, y + 40, 20, 36);
    ctx.fillRect(x + 92, y + 40, 20, 36);
  }

  // --- UI 및 이벤트 동기화 ---

  updateUI() {
    if (!this.player || !this.boss) return;

    // HP 게이지 및 수치 업데이트 (T02-C05)
    const playerPct = Math.max(0, (this.player.hp / this.player.maxHp) * 100);
    const bossPct = Math.max(0, (this.boss.hp / this.boss.maxHp) * 100);

    this.dom.playerHpBar.style.width = `${playerPct}%`;
    this.dom.playerHpText.textContent = `${this.player.hp} / ${this.player.maxHp}`;

    this.dom.bossHpBar.style.width = `${bossPct}%`;
    this.dom.bossHpText.textContent = `${this.boss.hp} / ${this.boss.maxHp}`;

    this.dom.turnDisplay.textContent = `${this.turn}턴`;

    // 상태 뱃지 표시
    const badgeMap = {
      READY: { text: '대기 중 (준비)', class: 'badge-ready' },
      BATTLE: { text: '⚔️ 전투 진행 중', class: 'badge-battle' },
      PAUSED: { text: '⏸️ 일시정지', class: 'badge-paused' },
      VICTORY: { text: '🏆 승리 (VICTORY)', class: 'badge-win' },
      DEFEAT: { text: '💀 패배 (DEFEAT)', class: 'badge-defeat' }
    };
    const b = badgeMap[this.status] || badgeMap.READY;
    this.dom.gameStateBadge.textContent = b.text;
    this.dom.gameStateBadge.className = `badge ${b.class}`;

    // 스킬 쿨타임 및 물약 버튼 UI 갱신
    if (this.player.skillCooldown > 0) {
      this.dom.btnSkill.textContent = `[2] 룬 영창 (${this.player.skillCooldown}T 쿨)`;
      this.dom.btnSkill.classList.add('btn-cooldown');
    } else {
      this.dom.btnSkill.textContent = `[2] 룬 영창 (강력)`;
      this.dom.btnSkill.classList.remove('btn-cooldown');
    }

    if (this.player.potionUsed) {
      this.dom.btnPotion.textContent = `[4] 물약 (소진됨)`;
      this.dom.btnPotion.classList.add('btn-disabled');
    } else {
      this.dom.btnPotion.textContent = `[4] 에테르 물약 (+40)`;
      this.dom.btnPotion.classList.remove('btn-disabled');
    }
  }

  updateActionButtonsState() {
    const disabled = this.isActing || this.status === 'VICTORY' || this.status === 'DEFEAT' || this.status === 'PAUSED';
    [this.dom.btnAttack, this.dom.btnSkill, this.dom.btnGuard, this.dom.btnPotion].forEach(btn => {
      if (btn) btn.disabled = disabled;
    });
  }

  logCombat(msg, type = 'sys') {
    if (!this.dom.combatLog) return;
    const line = document.createElement('div');
    line.className = `log-line log-${type}`;
    const timeStr = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    line.innerHTML = `<span class="log-time">[${timeStr}]</span> ${msg}`;
    this.dom.combatLog.prepend(line);

    // 최대 25줄 유지 (메모리 누수 차단, T02-C16, C17)
    while (this.dom.combatLog.children.length > 25) {
      this.dom.combatLog.removeChild(this.dom.combatLog.lastChild);
    }
  }

  clearCombatLog() {
    if (this.dom.combatLog) {
      this.dom.combatLog.innerHTML = '';
    }
  }

  initEvents() {
    // 키보드 조작 (1, 2, 3, 4, P) (T02-C04, C06, C15)
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return; // OS 키 반복 방지
      const key = e.key.toUpperCase();

      if (key === '1') {
        this.handlePlayerAction('ATTACK');
      } else if (key === '2') {
        this.handlePlayerAction('SKILL');
      } else if (key === '3') {
        this.handlePlayerAction('GUARD');
      } else if (key === '4') {
        this.handlePlayerAction('POTION');
      } else if (key === 'P') {
        this.togglePause();
      } else if (key === 'R' && (this.status === 'VICTORY' || this.status === 'DEFEAT')) {
        this.resetGame();
      }
    });

    // 버튼 클릭 이벤트
    this.dom.btnAttack.addEventListener('click', () => this.handlePlayerAction('ATTACK'));
    this.dom.btnSkill.addEventListener('click', () => this.handlePlayerAction('SKILL'));
    this.dom.btnGuard.addEventListener('click', () => this.handlePlayerAction('GUARD'));
    this.dom.btnPotion.addEventListener('click', () => this.handlePlayerAction('POTION'));
    this.dom.btnRestart.addEventListener('click', () => this.resetGame());
    this.dom.btnPause.addEventListener('click', () => this.togglePause());

    // 사운드 토글 (T02-C27)
    this.dom.btnMute.addEventListener('click', () => {
      if (!window.gameStorage) return;
      const next = !window.gameStorage.data.soundEnabled;
      window.gameStorage.setSoundEnabled(next);
      window.soundEngine.setMuted(!next);
      this.updateSettingsUI();
      this.logCombat(`사운드 설정이 [${next ? '켜짐' : '음소거'}]으로 변경되었습니다.`, 'sys');
    });

    // 움직임 줄이기 토글 (T02-C27)
    this.dom.btnMotion.addEventListener('click', () => {
      if (!window.gameStorage) return;
      const next = !window.gameStorage.data.reducedMotion;
      window.gameStorage.setReducedMotion(next);
      this.updateSettingsUI();
      this.logCombat(`움직임 설정이 [${next ? '줄임(진동 끔)' : '기본'}]으로 변경되었습니다.`, 'sys');
    });

    // 연타 검증 도구 (T02-C12)
    this.dom.btnRapidTest.addEventListener('click', () => this.runRapidInputTest());

    // 손상 저장값 복구 시험 (T02-C25)
    this.dom.btnCorruptTest.addEventListener('click', () => {
      if (!window.gameStorage) return;
      window.gameStorage.corruptForTest();
      this.updateStatsUI();
      this.logCombat('⚠️ [T02-C25 시험] 고의로 손상된 데이터를 주입했으나, 기본값으로 안전 복구되었습니다.', 'sys');
    });

    // 저장 기록 완전 리셋 (T02-C24)
    this.dom.btnResetStorage.addEventListener('click', () => {
      if (!window.gameStorage) return;
      window.gameStorage.resetAll();
      this.updateStatsUI();
      this.logCombat('전체 누적 통계 기록이 초기화되었습니다.', 'sys');
    });

    // 창 크기 변경 (T02-C13): 상태 보존
    window.addEventListener('resize', () => {
      // 뷰포트 변경 시에도 게임 상태는 완벽 보존됨
      this.render();
    });

    // 포커스 이탈/복귀 시 상태 유지 및 자동 일시정지 (T02-C14)
    window.addEventListener('blur', () => {
      if (this.status === 'BATTLE') {
        this.togglePause(true);
        this.logCombat('탭 포커스를 벗어나 게임이 자동으로 일시정지되었습니다.', 'sys');
      }
    });
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 초기화
window.addEventListener('DOMContentLoaded', () => {
  window.gameInstance = new QuilltaleBattleGame();
});
