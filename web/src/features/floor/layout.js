export const floorLayout = `<div class="content">
      <section class="left-panel">
        <div class="tabs left-tabs">
          <button data-tab="reservations" class="tab selected">Бронирования <em id="reserveCount">0</em></button>
          <button data-tab="waitlist" class="tab">Лист ожидания <em id="waitCount">0</em></button>
          <button data-tab="servers" class="tab">Официанты</button>
        </div>
        <div id="panelContent" class="panel-content"></div>
        <div id="panelBottom" class="panel-bottom"></div>
      </section>
      <section class="floor-section">
        <div class="floor-tabs">
          <div class="room-tabs">
            <button data-room="main" class="room active">Основной зал</button>
            <button data-room="terrace" class="room">Летняя терраса</button>
          </div>
          <div class="floor-actions">
            <button id="timeButton">◷ <span id="timeLabel">Сейчас</span></button>
            <button id="floorOptions">⋮</button>
          </div>
        </div>
        <div class="floor" id="floor">
          <div id="floorCanvas" class="floor-canvas"></div>
          <button id="fitFloor" class="fit-floor">↤↦</button>
        </div>
      </section>
    </div>
`;
