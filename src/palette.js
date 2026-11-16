// 팔레트. 전부 Claude가 프로토타입용으로 임시로 고른 값이다(예오스가 정한 색 아님).
// 방향만 기획 md 7장을 따른다: 푸른 하늘, 넓은 평면 색, 밝음과 어두움의 간격, 푸른 기가 도는 그림자.
export const P = {
  sky: { zenith: '#0a48bd', mid: '#3e8ee0', horizon: '#bfe8ee' },
  sun: '#fff1d4', hemiSky: '#86aeff', hemiGround: '#d9b790',
  walls: {
    house: ['#f1ece0', '#e9dfc8', '#dccdb0', '#cdbfa8', '#c7cfc8', '#e2d3c0', '#b9b0a2', '#efe6d2', '#d8c2a6', '#a9b6bf'],
    zakkyo: ['#f3efe6', '#e8e2d5', '#d9d4c9', '#cfc6b4', '#e7cdb5', '#c2ccd3', '#e3a999', '#f0d894', '#b9d0cf', '#d7b7a0', '#a8b8c8'],
    mansion: ['#f4f0e8', '#ecdfc9', '#e2c7ae', '#d1bfa9', '#c9d4d6', '#e9b5a3'],
    office: ['#eef0ee', '#dfe4e6', '#c9d3da', '#e9e1d1', '#b7c4cf', '#d5cdbf'],
    low: ['#e7e0d0', '#cfd3cf', '#d9c7ab', '#b8c0c4'],
  },
  roofTop: ['#b9b7b0', '#a9aca8', '#c4beb2', '#8fa894', '#9aa3ab'],
  tile: ['#3d4c63', '#4a5568', '#6f4a3d', '#84503c', '#49614f', '#5b5f66', '#2f3f52'],
  glass: ['#1f3b61', '#27506b', '#2c6672', '#34495e', '#6fa9cc'],
  frame: ['#e9ecec', '#8a8f94', '#3a3f45'],
  shopDark: '#2a3140',
  awning: ['#c8372d', '#2e7d52', '#1f4f8f', '#e08a2a', '#f2efe6', '#7a2f3a', '#e9c53b'],
  sign: ['#d8352a', '#f2c230', '#f5f1e6', '#2456a6', '#2f8f5b', '#ef7d22', '#e86b9a', '#1d2433', '#2aa3a3'],
  stair: ['#a5523a', '#8fb3a0', '#e6dcc3', '#6b4a3a', '#9db5c9', '#f0ede4'],
  tank: ['#e9e2cc', '#d9dcd8', '#c7d3d9'],
  ac: '#e4e2da',
  asphalt: '#73778c', sidewalk: '#cfc9bd', curb: '#ebe7dd', line: '#f3f0e6', lot: '#b7ae9d',
  pole: '#b9b5ab', poleMetal: '#6c7278', wire: '#1c2333',
  signal: '#56615f', trunk: '#6a5142', leaf: ['#2f7a4f', '#3f8f58', '#266a4a'],
  far: '#eef1f3',
};
