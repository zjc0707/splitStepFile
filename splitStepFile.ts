function readFile(file: Blob): Promise<string> {
    return new Promise<string>(resolve => {
        const r = new FileReader()
        r.onload = ev => resolve(ev.target!.result as string)
        r.readAsText(file, 'GB2312')
    })
}

function getFile(content: string, name: string): File {
    return new File([new Blob([content], {type: 'text/plain;charset=utf-8'})], name)
}

export async function splitStepFile(file: File): Promise<File[]> {
    const header = 'ISO-10303-21;\n' +
        'HEADER;\n' +
        'FILE_DESCRIPTION((\'STEP AP214\'),\'1\');\n' +
        'FILE_NAME(\'test.stp\',\'2020-10-30T08:18:32\',(\' \'),(\' \'),\'Spatial InterOp 3D\',\' \',\' \');\n' +
        'FILE_SCHEMA((\'AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }\'));\n' +
        'ENDSEC;\n\n' +
        'DATA;\n'

    const footer = '\nENDSEC;\n' +
        'END-ISO-10303-21;\n\n'

    const productIndexes: number[] = []
    const productDefinitionToProductIndex: number[] = []
    const relation: number[][] = []
    const arr: (string | undefined)[] = []
    const fileText = (await readFile(file))

    if (!fileText.includes('NEXT_ASSEMBLY_USAGE_OCCURRENCE(')) {
        return [file]
    }

    fileText.replace(/\r/g, '')
        .split('\n')
        .filter(p => p.startsWith('#'))
        .map(p => p.replace(/ /g, ''))
        .forEach(p => {
            const index = Number.parseInt(p.substring(1, p.indexOf('=')))
            arr[index] = p
            if (p.includes('PRODUCT(')) {
                productIndexes.push(index)
            } else if (p.includes('PRODUCT_DEFINITION(')) {
                productDefinitionToProductIndex[index] = productIndexes.length - 1
            } else if (p.includes('NEXT_ASSEMBLY_USAGE_OCCURRENCE(')) {
                const nums = p.substring(1).split('#').slice(1).map(getNum)
                if (nums.length !== 2) {
                    console.error('nums.length !== 2', nums.length, p)
                    return
                }
                const [f, s] = nums
                if (!relation[f]) {
                    relation[f] = []
                }
                relation[f].push(s)
            }
        })

    const products: number[] = []
    if (relation.length > 0) {
        relation.filter(p => p)
            .forEach(p => {
                p.filter(pp => !relation[pp])
                    .forEach(pp => {
                        products.push(productIndexes[productDefinitionToProductIndex[pp]])
                    })
            })
    } else {
        productIndexes.forEach(p => products.push(p))
    }

    console.log(products)
    const files: File[] = []
    for (let i = 0; i < products.length; i++) {
        const start = products[i]
        const end = ((i + 1 < products.length) ? products[i + 1] : arr.length)
        console.log(end)

        const stack: (string | undefined)[] = []
        const rs: (string | undefined)[] = []
        for (let j = start; j < end; j++) {
            stack.push(arr[j])
            rs[j] = arr[j]
        }

        while (stack.length > 0) {
            const s = stack.shift()?.substring(1)
            if (!s || !s.includes('#')) {
                continue
            }

            s.split('#')
                .slice(1)
                .forEach(p => {
                    const num = getNum(p)
                    if (!rs[num]) {
                        stack.push(arr[num])
                        rs[num] = arr[num]
                    }
                })
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        let filename = arr[start]!
        filename = filename.substring(filename.indexOf('('), filename.indexOf(','))
        filename = filename.substring(filename.indexOf('\'') + 1, filename.lastIndexOf('\''))
        if (rs.some(p => p && p.includes('CARTESIAN_POINT('))) {
            console.log(filename)
            const s = header + rs.filter(p => p).join('\n') + footer
            files.push(getFile(s, `${filename}.stp`))
        }
    }

    console.log(files)
    return files

    function getNum(p: string) {
        let b = p.length
        for (let j = 0; j < p.length; j++) {
            const code = p.charCodeAt(j)
            if (code < 48 || code > 57) {
                b = j
                break
            }
        }
        return Number.parseInt(p.substring(0, b))
    }
}
