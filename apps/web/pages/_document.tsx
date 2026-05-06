import Document, { Head, Html, Main, NextScript } from 'next/document';

export default class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head />
        <body>
          <script src="/runtime-config.js" />
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
