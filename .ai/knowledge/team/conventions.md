# 团队约定

## Agent 配置风格
- JSON 键：kebab-case（`java-developer`）
- 描述用中文，一句话说明职责
- temperature：分析类 0.2 / 讨论类 0.4 / 记录类 0.1
- 权限最小化：不需要写就不开 edit

## prompt 文件规范
- 每文件 5 节：Role / Responsibility / 严格限制 / Workflow / Output Format（可选 MCP / Skills / Guardrails）
- 存放于 `prompts/<team>/`
- 不写机密信息

## 知识库规范
- 知识必须可溯源（来自真实代码 / 决策）
- 更新前先列文件清单，经确认后写入
- 决策记录用 ADR 格式，必须有备选方案与否决理由

## 协作边界
- Advisory（讨论/需求/方案）只产出文档，不写代码
- Knowledge（manager/adr）只维护知识库，不写业务代码
- Java / Research / Creative 按各自 Workflow 执行
