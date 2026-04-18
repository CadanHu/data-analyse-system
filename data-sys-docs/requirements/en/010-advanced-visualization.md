# Requirements 010: Advanced Multi-dimensional Visualization and Auto-adaptation

## 1. Background
As business analysis requirements become more complex, basic charts (Bar, Line, Pie) are no longer sufficient for deep data insights. Users need richer chart types (e.g., Radar, Funnel, Trend Forecasting) to intuitively represent multi-dimensional data relationships.

## 2. Core Changes

### 2.1 Visualization Engine Upgrade
- **Expanded Chart Library**: Added support for 15+ advanced charts including Area, Scatter, Radar, Funnel, Gauge, Heatmap, Treemap, Sankey, Boxplot, Waterfall, and Candlestick.
- **AI-Driven Configuration**: The backend `SQLAgent` introduces `CHART_CONFIG_PROMPT`, leveraging AI to dynamically generate complex ECharts options for seamless "Data -> Chart" mapping.
- **Aesthetic Standardization**: Unified interaction standards for all charts (Tooltips, smooth curves, rounded corners, professional color palettes).

### 2.2 Prompt Engineering Refactoring
- **SQL Generation Enhancement**: Added chart selection criteria to `SQL_GENERATION_PROMPT`, enabling AI to automatically match the best display type based on data characteristics (e.g., line/area for time series, radar for multi-dimensional comparisons).
- **Visualization Intent Recognition**: Added `viz_config` parsing to support automatic X/Y axis mapping and multi-metric displays.

### 2.3 Frontend Adaptation
- **Dynamic Control Panel**: The `RightPanel` has been expanded with a chart switching menu supporting both "Smart Recommendation" and manual overrides.
- **Enhanced Fallback Scheme**: `fallbackGenerateChart` now supports automatic inference and rendering for more types to ensure basic display even when AI configuration is unavailable.

## 3. Verification Standards
- [ ] Ask "Analyze sales trends using an area chart"; the system should generate `chart_type: "area"` and render the chart correctly.
- [ ] Ask "Compare product performance across multiple dimensions"; the system should automatically select a `radar` chart.
- [ ] Verify that the `RightPanel` includes the 10+ new visualization options.
- [ ] Confirm that KPI-style queries (e.g., total sales) still accurately trigger the `card` display.

## 4. Impact Scope
- Backend: `SQLAgent`, `prompt_templates.py`
- Frontend: `RightPanel`, `EChartsRenderer`
- Documentation: `README.md`, `LOCAL_INSTALLATION.md`
