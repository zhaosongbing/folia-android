#!/usr/bin/env bash
# 发布 Android 版本到在线更新仓库：创建 Release（APK + 更新日志），并把这一版的更新日志
# 追加到仓库 README 的「更新日志」章节顶部。
#
# 用法：
#   ./scripts/publish-android-release.sh <apk 路径> <更新日志 md 路径> [版本号] [通道]
#
# 版本号省略时读 package.json 的 version（构建时 __APP_VERSION__ 取的也是它，
# Android 的 versionName 要与之一致，否则应用内比较会错位）。
#
# 通道：stable（正式版，默认）/ beta（内测版）/ dev（测试版）。
# 三种包发在同一个仓库，靠 tag 前缀区分，应用内按通道挑选：
#   stable → v0.7.22.0        beta → beta-v0.7.22.0      dev → dev-v0.7.22.0
# 非正式通道的 release 标成 prerelease（网页上带 Pre-release 标记，不会被当成最新版式发布）。
# 通道与 tag 前缀的规则只在 src/services/releaseChannel.ts 里写一份，改规则要两边一起改。
#
# 依赖：gh 已登录且对目标仓库有写权限；python 在 PATH 里（用来改 README）。

set -euo pipefail

REPO="zhaosongbing/folia-android-releases"
APK="${1:-}"
NOTES="${2:-}"
VERSION="${3:-}"
CHANNEL="${4:-stable}"

if [ -z "$APK" ] || [ -z "$NOTES" ]; then
    echo "用法：$0 <apk 路径> <更新日志 md 路径> [版本号] [stable|beta|dev]" >&2
    exit 1
fi

case "$CHANNEL" in
    stable) TAG_PREFIX=""; CHANNEL_LABEL=""; PRERELEASE=0 ;;
    beta)   TAG_PREFIX="beta-"; CHANNEL_LABEL="（内测）"; PRERELEASE=1 ;;
    dev)    TAG_PREFIX="dev-"; CHANNEL_LABEL="（测试）"; PRERELEASE=1 ;;
    *)
        echo "通道只能是 stable / beta / dev：$CHANNEL" >&2
        exit 1
        ;;
esac

[ -f "$APK" ] || { echo "找不到 APK：$APK" >&2; exit 1; }
[ -f "$NOTES" ] || { echo "找不到更新日志：$NOTES" >&2; exit 1; }

if [ -z "$VERSION" ]; then
    VERSION=$(node -p "require('./package.json').version")
fi

TAG="${TAG_PREFIX}v${VERSION}"

# 在线更新只认 release 资产里以 .apk 结尾的文件，这里先确认一下
case "$(basename "$APK" | tr '[:upper:]' '[:lower:]')" in
    *.apk) ;;
    *)
        echo "APK 文件名必须以 .apk 结尾（应用靠后缀挑下载直链）：$APK" >&2
        exit 1
        ;;
esac

echo "仓库：$REPO"
echo "通道：$CHANNEL${CHANNEL_LABEL}"
echo "标签：$TAG"
echo "APK ：$APK（$(stat -c%s "$APK" 2>/dev/null || echo '?') 字节）"
echo "日志：$NOTES"

# ---- 1. Release ----
if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
    echo "标签 $TAG 已存在，改为覆盖上传资产与日志。"
    gh release upload "$TAG" "$APK" --repo "$REPO" --clobber
    gh release edit "$TAG" --repo "$REPO" --notes-file "$NOTES"
else
    # 非正式通道标成 prerelease：网页上不会被当成「最新版式发布」，
    # GitHub 的 releases/latest 也不会把它当正式最新版（应用内按 tag 前缀自取，两边不冲突）。
    if [ "$PRERELEASE" = "1" ]; then
        gh release create "$TAG" \
            --repo "$REPO" \
            --title "Folia for Android ${VERSION}${CHANNEL_LABEL}" \
            --notes-file "$NOTES" \
            --prerelease \
            "$APK"
    else
        gh release create "$TAG" \
            --repo "$REPO" \
            --title "Folia for Android ${VERSION}" \
            --notes-file "$NOTES" \
            "$APK"
    fi
fi

# ---- 2. README 的更新日志 ----
# README 是用户在网页上能直接看到发布历史的地方；APP 内的弹窗读的是 Release body。
# 两处都要有，所以这里把同一份日志同步进 README。
echo "同步 README 更新日志…"
TMP_DIR=$(mktemp -d)
README_FILE="$TMP_DIR/README.md"
NOTES_FILE="$TMP_DIR/notes.md"

gh api "repos/$REPO/contents/README.md" --jq '.content' | base64 -d > "$README_FILE"
README_SHA=$(gh api "repos/$REPO/contents/README.md" --jq '.sha')

# 把更新日志压成「### 版本」+ 原始正文，插到「## 更新日志」之后
{
  echo "### ${VERSION}${CHANNEL_LABEL}"
  echo
  # 去掉正文里的一级标题（重复了）与行尾空白
  sed '/^## Folia for Android/d' "$NOTES"
  echo
} > "$NOTES_FILE"

python - "$README_FILE" "$NOTES_FILE" <<'PY'
import io
import sys

readme_path, notes_path = sys.argv[1], sys.argv[2]
readme = io.open(readme_path, encoding='utf-8').read()
notes = io.open(notes_path, encoding='utf-8').read().strip()

heading = '## 更新日志'
if heading not in readme:
    readme = readme.rstrip() + '\n\n' + heading + '\n'

head, _, tail = readme.partition(heading)

# 同一个版本重复发布时替换旧条目，而不是再插一份
version_line = notes.splitlines()[0]
if version_line in tail:
    before, _, rest = tail.partition(version_line)
    # 旧条目到下一个「### 」或文末为止
    rest_lines = rest.splitlines()
    cut = 0
    for index, line in enumerate(rest_lines):
        if index > 0 and line.startswith('### '):
            cut = index
            break
    else:
        cut = len(rest_lines)
    tail = before + '\n'.join(rest_lines[cut:])

updated = head + heading + '\n\n' + notes + '\n\n' + tail.lstrip('\n')
io.open(readme_path, 'w', encoding='utf-8').write(updated.rstrip() + '\n')
print('README 已合并 ' + version_line)
PY

# README 全文 base64 之后常常超过单条命令行的长度上限（--jq 那句会报
# `Argument list too long`），所以把要提交的字段写成 JSON 文件，用 --input 传进去。
README_JSON="$TMP_DIR/readme-update.json"
python - "$README_JSON" "更新日志：${TAG}" "$README_SHA" "$README_FILE" <<'PY'
import base64
import io
import json
import sys

out_path, message, sha, readme_path = sys.argv[1:5]
content = base64.b64encode(io.open(readme_path, 'rb').read()).decode()
io.open(out_path, 'w', encoding='utf-8').write(json.dumps({
    'message': message,
    'content': content,
    'sha': sha,
}))
PY
gh api -X PUT "repos/$REPO/contents/README.md" --input "$README_JSON" --jq '.commit.sha' > /dev/null

rm -rf "$TMP_DIR" 2>/dev/null || true

# ---- 3. Gitee ----
# 国内直连 GitHub 的下行只有十几 KB/s，Gitee 附件实测 1.6 MB/s，所以两边都发，
# 应用内优先查 Gitee。令牌只从环境变量读，不落盘。
if [ -n "${GITEE_TOKEN:-}" ]; then
    echo "发布到 Gitee…"
    python scripts/gitee_release.py \
        --owner zhaosongbing --repo folia \
        --tag "$TAG" --name "Folia ${VERSION}${CHANNEL_LABEL}" \
        --body "$NOTES" --apk "$APK" \
        $([ "$PRERELEASE" = "1" ] && echo "--prerelease") \
        || echo "Gitee 发布失败，GitHub 已完成" >&2
else
    echo "未设置 GITEE_TOKEN，跳过 Gitee（应用内会回退到 GitHub 源）"
fi

echo "完成：https://github.com/${REPO}/releases/tag/${TAG}"
