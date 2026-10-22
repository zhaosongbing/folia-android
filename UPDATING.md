# 同步上游与发版流程

这份文档记录两件事：上游（`Timingyyds/folia-android`）更新后怎么合进来，以及合完怎么出包发版。
下次上游有动静时照着做即可，不必翻历史对话。

## 仓库关系

| remote | 地址 | 用途 |
| --- | --- | --- |
| `origin` | `Timingyyds/folia-android` | 上游（只读，本地 `main` 跟踪它的 `main`） |
| `mine` | `zhaosongbing/folia-android` | 自己的备份，推到 `android-*.` 分支 |

`mine` 的 `main` 上另有一条 v1.7.0 的版本线，与本地的 0.7.21 系列没有共同历史，
所以备份一律推到 `android-0.7.21-custom` 这类分支，不要去碰 `mine/main`。

## 上游更新后的步骤

```bash
cd folia-android

# 1. 工作区必须是干净的；有改动先提交
git status --porcelain

# 2. 看上游新增了什么
git fetch origin
git log --oneline HEAD..origin/main

# 3. 合并
git merge origin/main

# 4. package.json 变了就补依赖
npm install

# 5. 验证：类型检查 + 单测
npx tsc --noEmit
npx vitest run -c vitest.config.ts test/unit/
```

第 5 步的判定标准：`tsc` 会剩一些既有错误，集中在 `dev/*-wgsl/harness.ts` 和
`src/audioNative/*`（`crypto-js` 缺类型声明、`WordArray` 可能为 undefined 等）。
只要没有**新出现的文件名**，就算干净。单测应当全绿。

## 冲突高发文件

这些是本项目改动集中的地方，上游若同时动过就会冲突：

- `src/components/FloatingPlayerControls.tsx`（切歌按钮、点击展开、定位按钮、尺寸）
- `src/App.tsx`（手势、返回键、系统栏、更新检查）
- `src/components/modal/settings/pages/*.tsx`（所有分组已改为折叠组）
- `src/i18n/locales/{zh-CN,en,in}.ts`（三份 key 必须同步增删）
- `android/app/src/main/java/top/izuna/foliamajor/MainActivity.java`
- `android/app/src/main/AndroidManifest.xml`
- `package.json`、`android/app/build.gradle`（版本号）

处理原则：**上游的界面与逻辑改动优先接受，我们自己的功能块整体保留**。
例如 `FloatingPlayerControls` 冲突时，保留上游的新样式与布局，再把
`playerBarClickToExpand` 分支、上一首常显、定位按钮、尺寸 style 重新贴回去。

冲突量太大时，改用逐个提交挑选：

```bash
git log --oneline HEAD..origin/main
git cherry-pick <commit>
```

## 出包与发版

版本号有两处，必须一起改：`package.json` 的 `version`（应用内显示的来源）与
`android/app/build.gradle` 的 `versionCode` / `versionName`（系统里的）。

```bash
# 前端产物
npx vite build
npx cap sync android

# 原生包
cd android && ./gradlew.bat assembleRelease && cd ..

# 签名（zipalign + apksigner，产物放 output/）
# 然后发布，脚本会同时更新 Release 与仓库 README 的更新日志
bash scripts/publish-android-release.sh \
  ../output/Folia-<版本>-release.apk \
  ../output/RELEASE-NOTES-v<版本>.md \
  <版本>
```

`publish-android-release.sh` 的两条硬性要求：APK 文件名必须以 `.apk` 结尾
（应用靠后缀挑下载直链）、更新日志用 Markdown 写（会原样进 Release 正文与 README）。

## 回滚

```bash
git merge --abort        # 合并中途放弃
git reset --hard HEAD     # 丢弃未提交改动回到最近提交（谨慎）
git reset --hard <commit> # 回到指定提交
```

同步前那一次 `本地定制：……` 的提交就是基线，随时可以回去。

## 常见坑

- `JAVA_HOME` 用正斜杠有时会让 gradlew 报 `jvm.cfg` 找不到，改用 `C:\...` 反斜杠写法。
- `npx cap sync android` 偶发 `Copying web assets ... failed`，重跑一次即可。
- 构建前不要把旧 `dist` 直接删（安全策略会拦批量删除），用 `mv dist dist-old-xxx`。
  `dist-old-*` 已在 `.gitignore` 里，不会进版本库。
- 语言文件是「顶层扁平 key + 嵌套对象」混合结构，插新 key 时注意前一项要补逗号。
