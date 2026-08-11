# src/data/diceService.ts

## 功能概述
该文件定义了一个名为 `diceService` 的骰子服务，它提供了一个统一的接口用于掷骰子。该服务被用于其他功能模块，如战斗系统、技能检定等，以生成随机数。

## 主要导出/接口

### 类型

- `DiceType`: 表示骰子的面数类型，可以是 4、6、8、10、12 或 20。
- `RollMode`: 表示掷骰子的模式，可以是 'sum'（累加求和）或 'independent'（独立展示）。

### 接口

- `DiceRequest`: 骰子请求接口，包含骰子面数、掷骰次数、掷骰模式以及可选的请求来源标识。
- `DiceResult`: 骰子结果接口，包含骰子面数、每次掷出的原始值、掷骰次数、模式、累加模式下的总和、请求来源和时间戳。

### 函数

- `rollDice(request: DiceRequest): DiceResult`: 执行一次骰子请求，返回结构化结果。
- `subscribeDice(listener: DiceEventListener): () => void`: 订阅骰子事件，返回取消订阅函数。
- `broadcastDiceResult(result: DiceResult): void`: 广播骰子结果给所有订阅者。

## 核心实现说明
`rollDice` 函数通过接收一个 `DiceRequest` 对象，生成指定次数和面数的随机数，并根据指定的模式返回结果。该函数使用 `Math.random` 生成随机数，并通过 `Math.floor` 和 `Math.random * sides` 来模拟掷骰子的过程。

该服务还提供了一个订阅机制，允许其他组件监听骰子事件。通过 `subscribeDice` 函数可以订阅事件，并通过 `broadcastDiceResult` 函数将结果广播给所有订阅者。

## 注意事项或使用方式
- 使用 `rollDice` 函数时，需要传入一个符合 `DiceRequest` 结构的对象。
- 通过 `subscribeDice` 订阅骰子事件后，可以通过返回的函数取消订阅。
- 在实际使用中，应确保传入的 `count` 参数在合理范围内，避免过大的随机数生成消耗过多资源。
