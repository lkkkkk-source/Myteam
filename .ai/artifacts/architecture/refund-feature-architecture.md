<!-- artifact: refund-feature-architecture.md -->
<!-- task_id: refund-feature | agent: java-architect | version: 1 -->
<!-- created_at: 2026-09-20T11:58:00 -->

# 退款功能 — 架构分析

## 技术栈清单
- Spring Boot + MyBatis-Plus（待确认版本）
- MySQL

## 模块依赖关系
```
Controller(refund) ──> Service(refund) ──> Mapper(order_status, refund_record)
                    └──> 订单状态机扩展 ──> 枚举 + 状态流转校验
```

## 需求 → 受影响文件对照表
| 需求 | 模块 | 受影响文件 |
|------|------|-----------|
| 退款接口 | controller | RefundController（新增） |
| 状态机扩展 | order | OrderStatusEnum / OrderStateMachine |
| 退款记录 | db | refund_record 表 + RefundRecordEntity + Mapper |

## 架构方案
- 推荐：独立 `refund` 包 + 订单状态机扩展（最小侵入）
- 备选：退款走独立服务（过度，不推荐）

## 风险与约束
- 状态机扩展需兼容现有订单状态（回归验证）
- 财务联动在 scope_out，本次不做

## 下一步（交 java-planner）
- 拆解 step-3（退款接口）与 step-4（状态机）的并行边界
- 明确 refund_record 表字段
