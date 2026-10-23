#!/usr/bin/env python3
"""把 APK 发布到 Gitee 的 Release。

Gitee 的 API 与 GitHub 有几处不同，脚本里都处理了：
- 认证用 `access_token` 查询参数，不是 Authorization 头；
- 附件上传是 multipart，且**没有覆盖语义**：重复上传会多出一个同名附件，
  所以先查同名附件、删掉、再传；
- 不返回 `html_url`，发布页由客户端从接口地址推导。

用法（token 只从环境变量读，不落盘、不进版本库）：
    GITEE_TOKEN=xxx python3 scripts/gitee_release.py \
        --owner zhaosongbing --repo folia \
        --tag v0.7.21.16 --name "Folia 0.7.21.16" \
        --body output/RELEASE-NOTES-v0.7.21.16.md \
        --apk output/Folia-0.7.21.16-release.apk
"""

import argparse
import json
import mimetypes
import os
import sys
import urllib.parse
import urllib.request
import uuid

API_ROOT = 'https://gitee.com/api/v5'


def request_json(method, url, token, payload=None, timeout=60):
    data = None
    headers = {'Accept': 'application/json'}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        headers['Content-Type'] = 'application/json; charset=utf-8'
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        body = response.read()
        return response.status, (json.loads(body.decode('utf-8')) if body else None)


def with_token(url, token):
    separator = '&' if '?' in url else '?'
    return f'{url}{separator}access_token={urllib.parse.quote(token)}'


def upload_attachment(api, token, release_id, apk_path):
    """multipart/form-data 上传。用标准库拼 body，避免依赖 requests。"""
    boundary = f'----Folia{uuid.uuid4().hex}'
    filename = os.path.basename(apk_path)
    content_type = mimetypes.guess_type(apk_path)[0] or 'application/octet-stream'
    with open(apk_path, 'rb') as handle:
        file_bytes = handle.read()

    parts = []
    parts.append(f'--{boundary}\r\n'.encode())
    parts.append(
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode()
    )
    parts.append(f'Content-Type: {content_type}\r\n\r\n'.encode())
    parts.append(file_bytes)
    parts.append(f'\r\n--{boundary}--\r\n'.encode())
    body = b''.join(parts)

    url = with_token(f'{api}/releases/{release_id}/attach_files', token)
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            'Content-Type': f'multipart/form-data; boundary={boundary}',
            'Content-Length': str(len(body)),
        },
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=300) as response:
        return response.status, json.loads(response.read().decode('utf-8'))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--owner', required=True)
    parser.add_argument('--repo', required=True)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--name', required=True)
    parser.add_argument('--body', required=True, help='更新日志 Markdown 文件')
    parser.add_argument('--apk', required=True)
    parser.add_argument('--branch', default='master', help='release 指向的分支')
    parser.add_argument('--prerelease', action='store_true', help='标成预发布（内测 / 测试通道）')
    args = parser.parse_args()

    token = os.environ.get('GITEE_TOKEN', '').strip()
    if not token:
        print('未设置 GITEE_TOKEN，跳过 Gitee 发布', file=sys.stderr)
        return 2

    api = f'{API_ROOT}/repos/{args.owner}/{args.repo}'
    notes = open(args.body, encoding='utf-8').read()

    # 1. 找已有 release（同一个 tag 就复用，否则新建）
    status, releases = request_json('GET', with_token(f'{api}/releases', token), token)
    if status != 200 or not isinstance(releases, list):
        print(f'读取 release 列表失败：HTTP {status}', file=sys.stderr)
        return 1

    existing = next((r for r in releases if r.get('tag_name') == args.tag), None)
    if existing:
        release_id = existing['id']
        print(f'复用已有 release：id={release_id} tag={args.tag}')
        # 更新正文与名称
        # Gitee 的更新接口把 tag_name 当必填，不带会 400 "tag_name is missing"
        request_json('PATCH', with_token(f'{api}/releases/{release_id}', token), token, {
            'tag_name': args.tag,
            'name': args.name,
            'body': notes,
            'prerelease': bool(args.prerelease),
        })
    else:
        print(f'新建 release：tag={args.tag}')
        status, created = request_json('POST', with_token(f'{api}/releases', token), token, {
            'tag_name': args.tag,
            'name': args.name,
            'body': notes,
            'target_commitish': args.branch,
            # 内测 / 测试通道标预发布：Gitee 网页上会带 Pre-release 标记，
            # 也不会被当成「最新正式版」。应用内按 tag 前缀自取，不依赖这个字段。
            'prerelease': bool(args.prerelease),
        })
        if status not in (200, 201):
            print(f'创建 release 失败：HTTP {status} {created}', file=sys.stderr)
            return 1
        release_id = created['id']

    # 2. 同名附件已存在就不再传
    # Gitee 的 API 里附件**没有 id**（assets 只有 name 和 downloading url），
    # 所以删不掉；重复上传只会又多一个同名文件，客户端挑第一个时可能拿到旧的。
    # 同一版本号只发一次，要重发就升版本号。
    status, detail = request_json('GET', with_token(f'{api}/releases/{release_id}', token), token)
    apk_name = os.path.basename(args.apk)
    for asset in (detail or {}).get('assets') or []:
        if asset.get('name') == apk_name:
            print(f'同名附件已存在，跳过上传：{apk_name}')
            print(f'下载地址：https://gitee.com/{args.owner}/{args.repo}/releases/download/{args.tag}/{apk_name}')
            return 0

    # 3. 上传新附件
    print(f'上传 {apk_name} …')
    status, uploaded = upload_attachment(api, token, release_id, args.apk)
    if status not in (200, 201):
        print(f'上传失败：HTTP {status} {uploaded}', file=sys.stderr)
        return 1

    print(f"完成：{uploaded.get('name')} ({uploaded.get('size')} 字节)")
    print(f'下载地址：https://gitee.com/{args.owner}/{args.repo}/releases/download/{args.tag}/{apk_name}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
