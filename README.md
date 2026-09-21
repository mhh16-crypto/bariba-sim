# BARIBA SIM — Standard 1v1

逆轉バリバリバース／バリバコイン Standard 規則 1v1 的非官方瀏覽器模擬器。

## 啟動

這個專案使用原生 ES modules，因此不要直接以 `file://` 雙擊 `index.html`。請在此資料夾啟動簡單的 HTTP server：

```bash
python3 -m http.server 8777
```

然後開啟：

- 遊戲：`http://localhost:8777/`
- 瀏覽器 smoke test：`http://localhost:8777/?test=1`

## 操作

1. 玩家 1、玩家 2 各選一枚硬幣。
2. 選擇猜拳勝者，再由勝者選 ORDER / XTREME。
3. 執行コイントス決定先攻。
4. 輪到你時，從自己的硬幣向後拖曳並放開；射擊方向與拖曳方向相反。
5. 若結果為 SAFE_RESET，射擊方可重新決定該硬幣的朝向。
6. 若結果為 SAFE_RELOCATE，射擊方先把硬幣移到合法場內位置，再決定朝向。

## 測試

```bash
node --test test/*.mjs
```

目前共 58 個 Node 測試，涵蓋資料、OX 規則、メタバリビィ攻防、物理碰撞、リバースポット、翻面與 match state machine。

## 備註

- 無 runtime dependencies、無 build step。
- 商品照片不包含在專案中；硬幣全部由 Canvas 程序繪製。
- 翻面與部分物理常數為模擬估值，可在開發者面板調整。
