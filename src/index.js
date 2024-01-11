import { exec } from 'child_process';
import { NEAR, Worker } from "near-workspaces";
import fs from "node:fs/promises";

const contractFile = './src/contract.ts'
const wasmFile = './build/contract.wasm';

const content = `
import { NearBindgen, view } from 'near-sdk-js';

@NearBindgen({})
export class SayHiContract {

    @view({})
    get_hi(): string {
        return "Hi";
    }
}
`;

const buildWasmFile = () => new Promise((resolve) => {
    // const command = `./node_modules/.bin/near-sdk-js build ${contractFile} ${wasmFile}`
    const command = `./src/near-sdk-js/packages/near-sdk-js/lib/cli/cli.js build ${contractFile} ${wasmFile}`
    return exec(command, (err, stdout, stderr) => {
        if (err) {
            console.error({ err });
            return;
        }
        // console.debug(stdout)
        resolve(stdout);
    })
});


const main = async () => {
    await fs.writeFile(contractFile, content);

    const worker = await Worker.init();

    const root = worker.rootAccount;
    console.time("build");

    await buildWasmFile()
    console.timeEnd("build");

    await fs.unlink(contractFile);

    console.time("deploy");

    const contract = await root.devDeploy(
        wasmFile,
        { initialBalance: NEAR.parse('30 N').toJSON() },
    );
    console.timeEnd("deploy");

    console.time("view");

    const result = await contract.view('get_hi', { account_id: root.accountId });
    console.timeEnd("view");
    console.log({ result }); // Hi
    await worker.tearDown();
}

console.time("total");
main().finally(() => {
    console.timeEnd("total");
})


// results of build time:
// original npm package: 9.235s
// without -Oz flag: 4.443s
//  + without checkTypescriptCom step:  3.925s
