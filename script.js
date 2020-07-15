'use strict';

// SVG円グラフを描画
const dataToGraph = (targetNode, dataset, title = '', option = {}) => {
    const width = 400;
    const height = 300;
    const outRadius = Math.min(width, height) / 2 - 10;
    const inRadius = outRadius * 0.4;
    const scale = d3.scaleLinear()
        .domain([0, d3.sum(dataset, eachData => eachData.value)])
        .range([0, 100]);

    // 要素を生成
    const docFlag = document.createDocumentFragment();
    const svg = d3.select(docFlag)
        .append('svg')
        .attr('version', '1.1')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('fill-opacity', .1);
    const partWrap = svg.append('g')
        .attr('class', 'partWrap')
        .attr('transform', `translate(${width / 2}, ${height / 2})`);
    const labelWrap = svg.append('g')
        .attr('class', 'labelWrap')
        .attr('transform', `translate(${width / 2}, ${height / 2})`);

    // 降順に並び替えるオプション
    if (option.sort) dataset.sort((a, b) => b.value - a.value);

    // 一定以下の値をまとめて「その他」にするオプション
    if (option.maxToOther) {
        let otherSum = 0;
        dataset.forEach((eachDate, i, arr) => {
            if (eachDate.value <= option.maxToOther) {
                arr[i] = null;
                otherSum += eachDate.value;
            }
        });
        if (otherSum) {
            dataset.push({ name: 'その他', value: otherSum });
        }
    } else if (option.showLength && option.sort) {
        // n番目まで表示し、それ以外は「その他」でまとめる
        let otherSum = 0;
        dataset.forEach((eachDate, i, arr) => {
            if (i >= option.showLength) {
                arr[i] = null;
                otherSum += eachDate.value;
            }
        });
        if (otherSum) {
            dataset.push({ name: 'その他', value: otherSum });
        }
    }

    // まとめた跡を消す
    dataset = dataset.filter(d => d != null);

    // データセットからグラフのパーツを描く
    const colorArr = ['#0048b3', '#008033', '#ad0000', '#a68608', '#80195a'];
    const colorScheme = d3.scaleOrdinal().range(colorArr);
    const dFormat = d3.pie()
        .value(d => scale(d.value))
        .sort(null);
    const genDValue = d3.arc()
        .outerRadius(outRadius)
        .innerRadius(inRadius);
    partWrap.selectAll('.graph_part')
        .data(dFormat(dataset))
        .enter()
        .append('path')
        .attr('d', genDValue)
        .attr('fill', (d, i, arr) => {
            // 見やすくなるよう色付け
            // パーツの数が色の数*nより1つ多いと、同じ色のパーツが隣り合ってしまうのでその対策
            if (i + 1 === arr.length && (i + 1) % colorArr.length === 1) {
                return colorScheme(1);
            } else {
                return colorScheme(i);
            }
        })
        .attr('stroke', 'none')
        .attr('class', 'graph_part');

    // パーツの中央にラベルを配置
    const getCenterPos = d3.arc()
        .outerRadius((outRadius + inRadius) / 2)
        .innerRadius((outRadius + inRadius) / 2);
    labelWrap.selectAll('.graph_label')
        .data(dFormat(dataset))
        .enter()
        .append('text')
        .attr('fill', 'black')
        .attr('transform', d => 'translate(' + getCenterPos.centroid(d) + ')')
        .attr('dy', height / 100 + 'px')
        .attr('font-size', height / 25 + 'px')
        .attr('fill', '#dfdfdf')
        .attr('text-anchor', 'middle')
        .attr('class', 'graph_label')
        .text(d => {
            const round = (num, decimalLen) => {
                const decimalSplit = (num + '').split('.');
                if (decimalSplit.length === 1 || !(decimalSplit[1].length > decimalLen)) {
                    return +num;
                } else {
                    return +num.toFixed(decimalLen);
                }
            };
            return `${d.data.name} (${round(scale(d.data.value), 3)}%)`;
        });

    // fragment等からグラフの要素を追加
    if (title) targetNode.append('figcaption').text(title);
    targetNode.node().appendChild(docFlag);

    // フェードイン
    svg.transition()
        .duration(1500)
        .ease(d3.easeCircleOut)
        .attr('fill-opacity', 1);
};

const report = {};
fetch(new Request('caniuse.json'))
    .then(res => res.json())
    .then(data => {
        console.log('Can I Useのデータ', data);

        report.browser = {};
        const browserShareDataset = [];
        // data.agents[ブラウザID].usage_globalブラウザシェアを取得
        // 他に、ブラウザの最新バージョンも取得
        for (let browserID in data.agents) {
            const agentObj = data.agents[browserID];
            let usageSum = 0;
            for (let eachVersion in agentObj.usage_global) {
                usageSum += agentObj.usage_global[eachVersion];
            }
            const versions = agentObj.versions.filter(d => d);
            report.browser[browserID] = {
                formalName: agentObj.browser,
                latest: versions[versions.length - 1],
                usage: usageSum,
                compatCount: {
                    y: 0,
                    a: 0,
                    n: 0,
                    u: 0
                }
            };
            browserShareDataset.push({
                name: agentObj.browser,
                value: usageSum
            });
        }
        // 取得したデータをグラフに
        dataToGraph(d3.select('.browser_share'), browserShareDataset, '', {
            showLength: 5,
            sort: true
        });

        // カテゴリーオブジェクトを作り、カテゴリーに属する機能のID群による配列を作る
        const categoryArr = Object.keys(data.cats).sort();
        const subCatArr = categoryArr.map(eachCat => {
            const returnArr = [];
            for (let eachSubCat of data.cats[eachCat]) {
                returnArr.push(eachSubCat);
            }
            return returnArr;
        }).flat();
        report.categories = Object.fromEntries(subCatArr.map(d => [d, []]));
        for (let eachID in data.data) {
            const categories = data.data[eachID].categories;
            for (let eachCat of categories) {
                report.categories[eachCat].push(eachID);
            }
        }

        // カテゴリー階層をselect-optgroup-option要素に出力
        const defaultCat = 'HTML5';
        const selectCatInput = d3.select('.options')
            .append('label')
            .attr('class', 'selectCat')
            .text('カテゴリーを選択')
            .append('select')
            .attr('class', 'selectCatInput');
        categoryArr.forEach(eachCat => {
            const eachOptG = selectCatInput.append('optgroup')
                .attr('label', eachCat);
            data.cats[eachCat].forEach(eachSubCat => {
                const subCatElem = eachOptG.append('option').text(eachSubCat);
                if (eachSubCat === defaultCat) subCatElem.attr('selected', 'true');
            });
        });

        // カテゴリセレクタのchangeイベントでグラフを描画
        const compatStatsLabel = {
            y: '対応',
            a: '一部対応',
            n: '非対応',
            u: '不明'
        };
        const changeStatGraph = (opt = {}) => {
            const val = opt.value || d3.event.target.value;
            const fnArr = report.categories[val];
            const browserReport = report.browser;
            const outputWrap = d3.select('.compat_rate_wrap');

            for (let browserID in browserReport) {
                const compatCount = browserReport[browserID].compatCount;
                for (let eachCompat in compatCount) compatCount[eachCompat] = 0;
            }

            // 各ブラウザごとに、どれほどの機能に対応しているのか集計
            fnArr.map(fnID => {
                // 各機能について
                const fnObj = data.data[fnID];
                const stats = fnObj.stats;
                for (let browserID in stats) {
                    // 各機能のstatsの各ブラウザについて
                    const latest = browserReport[browserID].latest;
                    let compatStat = stats[browserID][latest];
                    // pとnはどちらも非対応の意なので、まとめる
                    const compatCount = browserReport[browserID].compatCount;
                    if (compatStat[0] === 'p') compatStat = 'n';
                    compatCount[compatStat[0]]++;
                }
            });

            // 集計データに基づきグラフを描画
            d3.select('.func_category').text(`カテゴリー「${val}」のブラウザ対応率(全${fnArr.length}項目中)`);
            outputWrap.selectAll('*').remove();
            for (let browserID in browserReport) {
                const dataset = [];
                const compatCount = browserReport[browserID].compatCount;
                for (let eachCompat in compatCount) {
                    const compatFlag = eachCompat[0];
                    dataset.push({
                        name: compatStatsLabel[compatFlag],
                        value: compatCount[compatFlag]
                    });
                }
                const graphElem = outputWrap.append('figure')
                    .attr('class', 'graph compat_rate');
                const title = data.agents[browserID].browser + 'の対応率';
                dataToGraph(graphElem, dataset, title);
            }
        };
        selectCatInput.on('change', changeStatGraph);
        // 最初はCSSの対応グラフを出しておく
        changeStatGraph({ value: defaultCat });

        // データ更新日を出力
        const lastModify = new Date(data.updated * 1000);
        const JPDateFormat = new Intl.DateTimeFormat('ja-JP', {
            year: 'numeric',
            month: 'narrow',
            day: 'numeric'
        });
        d3.select('.last_modify')
            .attr('datetime', lastModify.toISOString())
            .text('JSONデータ更新日：')
            .append('time')
            .text(JPDateFormat.format(lastModify));
    })
    .catch(e => {
        console.error('データ取得に失敗しました。', e);
    });

// 結論：D3.jsは神
// 追記：Can I Useは最高