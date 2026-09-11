#!/usr/bin/env bash
# GENERATED_BY_AI
# MODEL: claude-sonnet-5
# DATE: 2026-09-10
#
# 断言 STACK_ROOT 是一个能在目标主机上用的绝对路径。
#
# **为什么需要它：这个错误没有任何报错面.**
#
# 移植自 vx-agent-tenderforge 的真实事故（v0.1.0 部署，2026-09-10）: 在
# Windows 的 Git Bash 里执行 `gh secret set DEPLOY_DIR --body '/srv/md0/x'`
# (或同样用 `--body` 的 `gh variable set`), MSYS 的路径转换会把这个实参改写
# 成 `D:/Program Files/Git/srv/md0/x` 再交给 gh.exe, 存进去的就是这个值.
#
# 那在 Linux 上是一个合法的**相对路径**, 于是:
#
#   mkdir -p 'D:/...'   成功 (在部署账号的家目录下建出一整棵树)
#   rsync 投递           成功
#   compose 名断言       成功
#   远端第一次 cd        成功
#   deploy.sh 再 cd      失败 —— 而它已经离病因很远了
#
# 中间每一步都一致地成功, 因为它们用的是同一个错值. 唯一暴露它的是最后那次
# 相对路径从新工作目录再解析一遍. **那是偶然, 不是设计.**
#
# 更糟的是它会反复发生: 把误建的树删掉, 下一次 deploy / rollback / db-init /
# env-update 照样重建 —— 因为没有任何一处检查过这个值的形态. yucer 有四个
# 使用点 (deploy.yml / db-init.yml / rollback.yml / env-update.yml), 原先
# 各自只有一条 `case "$STACK_ROOT" in /*)` 的一次性检查, 只挡"不是绝对路径"
# 一种形态 —— 挡得住这次事故那个具体值 (D: 开头, 不以 / 起始), 但挡不住
# MSYS 有时产出的 POSIX 形态 (`//d/Program Files/...`, 以 / 开头, 会被那条
# 检查放行) 或误粘贴的反斜杠/冒号.
#
# 所以这里在**任何远端命令之前**把话说死. 宁可在 CI 上红一次, 也不要在目标
# 主机上安静地建出一棵谁也不认识的目录树.
set -euo pipefail

dir="${1-}"

fail() {
  echo "::error::STACK_ROOT 不可用：$1" >&2
  echo "        当前值：'${dir}'" >&2
  echo "        它必须是目标主机上的绝对路径，例如 /srv/md0/yucer。" >&2
  echo "        在 Windows 上用 \`gh variable set STACK_ROOT --env <env> --body '/abs/path'\`" >&2
  echo "        会被 MSYS 路径转换改写；值一律走 stdin：" >&2
  echo "        printf '%s' '/abs/path' | gh variable set STACK_ROOT --env <env>" >&2
  exit 1
}

[ -n "$dir" ] || fail "为空"

# 反斜杠字符用八进制构造，**不写字面量**。
#
# 这里如果写 `*[\\]*`，实测匹配不到任何东西：从 heredoc 到 shell 再到
# case，每一层都会吃掉一次转义，落到文件里只剩 `*[\]*`——括号表达式没有
# 闭合，模式永远不匹配。它不报错，只是那条分支形同虚设，Windows 路径会落到
# 下一条上，报出的理由指向错的方向。
#
# 八进制没有转义层可吃：printf 之后它就是一个字符，模式里加引号就是字面匹配。
backslash="$(printf '%b' '\134')"

case "$dir" in
  # 先查 Windows 形态：它比"不是绝对路径"更具体，报出来能直接指向病因。
  # 反斜杠与盘符冒号都不该出现在一个 POSIX 路径里。
  *"$backslash"*) fail "含反斜杠，像是 Windows 路径" ;;
  *:*) fail "含冒号，像是被 MSYS 路径转换改写过的盘符路径" ;;
esac

case "$dir" in
  /*) ;;
  *) fail "不是绝对路径" ;;
esac

case "$dir" in
  # 结尾的斜杠会让 "$dir/deploy" 变成 "//deploy"。在多数情形下无害，
  # 但 rsync 对结尾斜杠的语义是**不同的**，而那个差别会以"文件被放到了
  # 上一层"的形式出现。与其解释它，不如不允许。
  */) fail "不要以斜杠结尾——rsync 对结尾斜杠的语义不同" ;;
esac

echo "[assert] STACK_ROOT = ${dir}"
