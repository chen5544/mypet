# 🐱 Cat Desktop Pet

这是一只运行在 macOS / Windows 桌面上的电子猫咪，默认会跟随鼠标方向转动，并支持多种动作动画。项目基于 Electron 和精灵图渲染，适合用于桌面挂件、个人展示或二次开发。

<img src="build/icon.png" width="128" height="128" alt="Cat icon">

## 快速开始

### macOS

1. 下载 `dist/Cat Desktop Pet-1.0.0-mac-arm64.dmg`（Apple Silicon）或 `dist/Cat Desktop Pet-1.0.0-mac-x64.dmg`（Intel）
2. 双击打开 DMG，将应用拖入 Applications
3. 首次运行时，右键点击应用并选择「打开」，以绕过 Gatekeeper 限制

### Windows

1. 下载 `dist/Cat Desktop Pet-1.0.0-win-x64.zip`
2. 解压到任意目录
3. 双击运行 `Cat Desktop Pet.exe`

### 开发环境

```bash
# 前置要求：Node.js ≥ 18
git clone https://github.com/chen5544/mypet.git
cd mypet
npm install

# 启动桌宠（Electron）
npm start

# 浏览器中预览方向跟踪（Vite）
npm run preview
```

## 功能特性

| 动作 | 说明 |
|---|---|
| 🎯 **跟随** | 默认状态，猫头会跟随鼠标方向转动 |
| 🏃 **奔跑** | 窗口水平移动 200px/s，触碰屏幕边缘时自动反向，并带有渐隐过渡 |
| 🍽️ **吃饭** | 原位动画，缩小至 60% |
| 🎾 **玩耍** | 原位动画，28fps 循环 |
| 🦘 **跳跃** | 原位动画，56fps 双倍速 |
| 😴 **睡觉** | 原位动画，缩小至 75% |
| 🧼 **洗脸** | 原位动画，等比例缩放至 70% |
| 🚶 **行走** | 窗口水平移动 115px/s，触碰屏幕边缘时自动反向，并带有渐隐过渡 |

### 交互方式

- 鼠标悬浮时，四周会出现动作按钮
- 点击按钮可切换动作
- 右键可强制唤出按钮菜单
- 行走或奔跑时点击猫咪，可返回跟随状态
- 托盘菜单支持锁定（鼠标穿透）、解锁、移回右下角和退出

### 锁定模式

通过托盘菜单中的「锁定并鼠标穿透」可将猫咪固定在桌面上，并让鼠标事件穿透到后方窗口，适合长期挂在桌面上使用。

## 素材制作

项目中的精灵图通过绿幕视频自动抠图生成。

```bash
# 处理方向跟踪主视频
npm run process:video "/path/to/video.mp4"

# 处理各类动作视频
npm run process:run       # 奔跑
npm run process:eat       # 吃饭
npm run process:play      # 玩耍
npm run process:jump      # 跳跃
npm run process:sleep     # 睡觉
npm run process:walk-left # 向左行走
npm run process:wash      # 洗脸

# 向右行走/奔跑由向左素材镜像自动生成

# 验证所有资源
npm run validate
```

### 绿幕参数

抠图阈值位于 `scripts/process-video.mjs` 和 `scripts/process-run-video.mjs`：

- 基色：`[56, 166, 35]`
- 采用颜色距离 + 绿色优势 + 阴影通道检测
- 支持绿边抑制与内部透明孔洞修补

调整后需要重新执行对应 `process:*` 命令，并运行 `npm run validate`。

## 方向校准

猫头角度与帧号的映射关系位于 `src/angle-config.js` 的 `ANGLE_ANCHORS` 中。如果猫咪对鼠标方向的响应有偏差，可修改锚点后执行：

```bash
npm run validate
npm start
```

## 项目结构

```text
src/
  main.js           → Electron 主进程（窗口、托盘、光标轮询、行走引擎）
  preload.cjs       → contextBridge API
  renderer.js       → 渲染循环、精灵帧插值、动作状态机
  angle-config.js   → 方向锚点、帧映射、共享常量
  styles.css        → 透明窗口样式、动作菜单
scripts/
  process-video.mjs    → 绿幕抠图 + 精灵图打包（方向视频）
  process-run-video.mjs → 动作视频处理（含 padToSquare、Lanczos-3 缩放）
  validate-assets.mjs  → 帧数 / 尺寸 / Alpha / 角度连续性校验
public/assets/sprites/ → 运行时精灵图（13×N 列网格 PNG）
```

## 构建安装包

```bash
npm run dist:mac   # macOS DMG + ZIP
npm run dist:win   # Windows ZIP（便携版）
npm run dist:all   # 全部平台
```

构建产物将输出到 `dist/` 目录。

## 技术亮点

- **Lanczos-3 缩放**：相比双线性插值，能更好地保留高频细节
- **padToSquare**：将竖屏素材补齐为正方形后再缩放，保持宠物比例更自然
- **边缘渐隐**：接近屏幕边缘时会平滑淡出，掉头后重新淡入
- **绿幕抠图**：结合颜色距离、绿色优势、阴影通道与边缘羽化处理

## 替换成自己的宠物（可免费）

如果你想把这个桌宠换成自己的宠物，流程并不复杂：

1. 拍一张宠物的全身照片，尽量保证光线均匀
2. 将背景去除并替换为绿幕，得到基础素材（使用 chatgpt 免费去除背景）
3. 基于这个基础素材，让 ai生成各个你想要的动作的提示词，站立、走动、吃饭、玩耍等
4. 基于这个基础素材，和 ai生成的提示词，再用视频生成模型产出 7 秒左右的绿幕动作视频（豆包每天都有免费、不排队的 seedance2 模型调用次数）
5. 最后用 Claude Code、Codex 或其他代码助手打开这个项目，把素材替换进对应动作的精灵图生成流程中即可。（接 deepseek≈不用钱啦）

国内可优先尝试即梦的Seedance，豆包经常提供免费额度。

