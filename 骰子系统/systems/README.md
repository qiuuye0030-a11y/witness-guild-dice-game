# 10.07模块化源码

游戏10.07，战斗规则15。文件名中的V13/V14保留为兼容接口，不是当前玩法版本。

- `battle/rules.js`：基础与预算；`battle/examiners.js`：普通14人资料。
- `battle/core.js`：单位、时间轴、施法、伤害与胜负。
- `battle/modern.js`：追势、连击、免伤、会员新版机制的共用入口。
- `battle/projection.js`与`unified-decision.js`：使用实际规则的公开状态预测与AI，不读取未来骰序。
- `challenge/`：隔离的会长档案、四被动、挑战状态、目录界面与样式。会长不加入普通名册。
- `campaign/core.js`、`journey.js`、`modern.js`：培养、猎魂、读档迁移。
- 每个`compose.js`各装配一次；新增功能不靠逐层覆盖原型实现。

顶层`skill-effects.js`为技能子类生成源；`campaign-ui.js`、`battle-ui-v13.js`、`skill-text.js`及CSS为界面源。生成的`core.js`、`campaign.js`、`battle-v13-browser.js`等通过同步与构建产生，不单独手改。

构建：`python _full_package.py` → `_build_1007.py`。核验：`node tools/check.cjs`。源码包应在新目录重建，不能覆盖旧10.06。

历史命名的迁移和生成脚本不作为当前入口。对照复跑使用`tools/simulate-1007.cjs`，结果必须保存新目录/种子，避免把已查看样本再次称为独立盲测。
