# src/data/calendarData.ts

## 功能概述
该文件定义了哈普托斯历（Harptos Calendar）的数据结构和计算工具，用于处理与被遗忘的国度（Forgotten Realms）世界观相关的日期计算。它提供了月份信息、节日配置、日期转换等功能，是项目日期处理的核心模块。

## 主要导出/接口

### 类型

- `MonthInfo`: 月份信息接口，包含月份索引、中文名、英文名、天数、节日等信息。
- `DateResult`: 日期结果接口，包含月份、日期、是否为节日、节日名称等信息。
- `FestivalConfig`: 节日配置接口，包含节日名称、在哪个月份之后、是否仅闰年有等信息。
- `DayCell`: 日历网格单元格接口，包含日期和十天信息。
- `MonthGrid`: 月度网格接口，包含天数、是否有节日、节日名称、额外节日名称、节日和额外节日在年内的第几天等信息。

### 函数

- `getMonthStarts(leap: boolean)`: 获取每个月起始的年内第几天数组。
- `getYearDays(year: number)`: 获取某年的总天数。
- `isLeapYear(year: number)`: 判断某年是否为闰年。
- `dayOfYearToDate(dayOfYear: number, year: number)`: 将年内第几天转换为月/日/节日。
- `dateToDayOfYear(month: number, day: number, year: number)`: 将月/日转换为年内第几天。
- `getMonthGrid(month: number, year: number)`: 获取某月的日历网格数据。
- `getRealWorldDayOfYear()`: 获取现实世界今天的年内第几天。
- `getTendayName(tenday: number)`: 获取某天的十天名称。
- `formatDate(month: number, day: number, year: number)`: 格式化日期显示。
- `formatFullDate(month: number, day: number, year: number)`: 格式化完整日期（含官方名和十天）。

### 常量

- `MONTHS`: 包含十二个月份信息的数组。
- `FESTIVALS`: 包含节日配置信息的数组。

## 核心实现说明
该文件的核心实现包括月份信息、节日配置、日期转换等功能。它通过定义接口和函数，实现了日期的转换、节日的判断和格式的输出。这些功能与项目其他模块如用户界面、游戏逻辑等紧密相关，为项目提供了日期处理的基础。

## 注意事项或使用方式
- 使用 `dayOfYearToDate` 和 `dateToDayOfYear` 函数时，请确保传入的日期和年份是有效的。
- `getMonthGrid` 函数返回的 `MonthGrid` 对象中，`festivalDayOfYear` 和 `extraFestivalDayOfYear` 字段仅在节日存在时有效。
- `formatDate` 和 `formatFullDate` 函数用于格式化日期显示，可以根据需要传入月份、日期和年份。
