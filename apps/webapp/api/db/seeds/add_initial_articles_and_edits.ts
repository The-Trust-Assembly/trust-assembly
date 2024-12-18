import { AbstractSeed, Info, ClientPostgreSQL } from "https://deno.land/x/nessie@2.0.11/mod.ts";

export default class extends AbstractSeed<ClientPostgreSQL> {
    /** Runs on seed */
    async run(info: Info): Promise<void> {
        await this.client.queryArray`INSERT INTO articles (url, headline)
            VALUES (
                'https://www.cnn.com/2024/12/05/politics/john-roberts-transgender-skrmetti-analysis',
                'Analysis: John Roberts leads the charge to uphold bans on trans care'
            ), (
                'https://www.cnn.com/2024/12/05/politics/pete-hegseth-private-turmoil-invs',
                'As Hegseth''s public profile grew, he faced deepening private turmoil'
            ), (
                'https://www.cnn.com/2024/12/05/entertainment/macaulay-culkin-son-home-alone',
                'Macaulay Culkin says his son ''thinks he''s Kevin'' from ''Home Alone'' and yes, it''s adorable'
            );`;
        await this.client.queryArray`INSERT INTO creators (name)
            VALUES ('Scott Alexander'), ('Some Guy');`;
        await this.client.queryArray`INSERT INTO article_edits (article_id, creator_id, headline)
            VALUES (
                1,
                1,
                'John Roberts headline from ACX'
            ),
            (
                1,
                2,
                'John Roberts headline from Extelligence'
            ), (
                2,
                1,
                'Pete Hegseth headline from ACX'
            ), (
                3,
                2,
                'Disregard this article (from Extelligence)'
            );`;
    }
}
