// 시작할 때 실행 환경의 사양을 읽어 섀도 맵 해상도를 고른다.
// 브라우저는 사양을 정확히 알려주지 않는다. 그래픽 카드 이름, 메모리, 코어 수, 모바일 여부로 "추정"하는 것이다.
// 등급 기준과 등급별 해상도는 Claude가 임시로 잡았다.
import * as THREE from 'three';

const SHADOW = { high: 8192, mid: 4096, low: 2048 };
const NAME = { high: '높음', mid: '중간', low: '낮음' };

export function detectSpec(renderer) {
  const gl = renderer.getContext(), q = new URLSearchParams(location.search);
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
  const mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency;
  const mobile = (navigator.userAgentData && navigator.userAgentData.mobile) || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  let tier, why;
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpu)) { tier = 'low'; why = '소프트웨어 렌더러'; }
  else if (mobile || /mali|adreno|powervr|videocore|apple a\d/i.test(gpu)) { tier = 'low'; why = '모바일'; }
  else if (/rtx|gtx|titan|quadro|radeon\s*(\(tm\)\s*)?(rx|pro)|\barc\b/i.test(gpu) && !/geforce\s*(mx|gt\s)/i.test(gpu)) { tier = 'high'; why = '외장 그래픽'; }
  else if (/intel|iris|uhd|radeon|vega|geforce|apple/i.test(gpu)) { tier = 'mid'; why = '내장·보급형 그래픽'; }
  else { tier = 'mid'; why = '알 수 없는 그래픽'; }
  // 메모리나 코어가 적으면 한 단계 내린다
  if ((mem !== undefined && mem <= 4) || (cores !== undefined && cores <= 4)) {
    const down = { high: 'mid', mid: 'low', low: 'low' }[tier];
    if (down !== tier) { tier = down; why += ', 메모리·코어 적음'; }
  }
  // 확인용: ?tier=low|mid|high, ?shadow=숫자 로 강제
  let forced = false;
  if (SHADOW[q.get('tier')]) { tier = q.get('tier'); forced = true; }
  let shadow = SHADOW[tier];
  if (+q.get('shadow') > 0) { shadow = +q.get('shadow'); forced = true; }
  shadow = Math.min(shadow, renderer.capabilities.maxTextureSize);
  return { tier, tierName: NAME[tier], why: forced ? '직접 지정' : why, shadow, gpu, mem, cores, mobile, forced };
}

/**
 * 그림자 경계를 선명하게: 걸러진(부드러운) 그림자 값을 0.5에서 다시 끊는다.
 * 해상도가 낮아도 경계가 톱니 대신 매끈한 선으로 떨어진다. 대신 텍셀 1.5칸보다 가는 그림자는 사라진다.
 */
export function sharpenShadows() {
  const src = THREE.ShaderChunk.shadowmap_pars_fragment;
  if (!src.includes('float getShadow(') || !src.includes('vec2 cubeToUV(') || src.includes('getShadowRaw')) return false;
  THREE.ShaderChunk.shadowmap_pars_fragment = src.replace('float getShadow(', 'float getShadowRaw(').replace('vec2 cubeToUV(', `float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float s = getShadowRaw( shadowMap, shadowMapSize, 1.0, shadowBias, shadowRadius, shadowCoord );
		float w = clamp( fwidth( s ) * 0.75, 0.02, 0.5 );
		return mix( 1.0, smoothstep( 0.5 - w, 0.5 + w, s ), shadowIntensity );
	}
	vec2 cubeToUV(`);
  return true;
}
