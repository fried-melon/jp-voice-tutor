import bpy, time, os, glob
t0=time.time()
def stage(msg): print(f"STAGE[{time.time()-t0:6.1f}s] {msg}", flush=True)

bpy.ops.preferences.addon_enable(module='bl_ext.user_default.mpfb')
scene = bpy.context.scene
DATA = os.path.expanduser('~/.config/blender/4.2/extensions/.user/user_default/mpfb/data')

# Invented tutor character (no real person's likeness): young-adult East-Asian female
scene.MPFB_NH_add_phenotype = True
scene.MPFB_NH_phenotype_race = 'asian'
scene.MPFB_NH_phenotype_gender = 'female'
scene.MPFB_NH_phenotype_age = 'young'
scene.MPFB_NH_phenotype_influence = float(os.environ.get('INFLUENCE','0.8'))
scene.MPFB_NH_phenotype_muscle = 'minmuscle'
scene.MPFB_NH_phenotype_weight = 'minweight'
scene.MPFB_NH_phenotype_proportions = 'min'
scene.MPFB_NH_phenotype_height = 'maxheight'
scene.MPFB_NH_add_breast = True
scene.MPFB_NH_phenotype_breastsize = 'mincup'
scene.MPFB_NH_phenotype_breastfirmness = 'minfirmness'
bpy.ops.mpfb.create_human()
basemesh = bpy.context.scene.objects['Human']
if 'Cube' in bpy.context.scene.objects:
    bpy.data.objects.remove(bpy.context.scene.objects['Cube'])
bpy.context.view_layer.objects.active = basemesh
stage("human created")

# TalkingHead rig + weights
bpy.ops.mpfb.load_rig(filepath='/home/sandbox/jp-tutor/tools/th-data/talkinghead.mpfbskel')
bpy.ops.mpfb.load_weights(filepath='/home/sandbox/jp-tutor/tools/th-data/talkinghead.mhw')
stage("rig+weights")

# GameEngine PBR + no material instances
try: scene.MPFB_ASLS_material_instances = False
except Exception: pass
try: scene.MPFB_ASLS_skin_type = 'GAMEENGINE'
except Exception: pass

# Skin
from bl_ext.user_default.mpfb.services import HumanService
skin = os.path.join(DATA, 'skins/young_asian_female/young_asian_female.mhmat')
HumanService.set_character_skin(skin, basemesh, skin_type='GAMEENGINE', material_instances=False)
stage("skin")

# Body parts + outfit (same asset families as production reference)
bpy.context.view_layer.objects.active = basemesh
basemesh.select_set(True)
def load(subdir, name, otype):
    fp = os.path.join(DATA, subdir, name, name + '.mhclo')
    bpy.ops.mpfb.load_library_clothes(filepath=fp, object_type=otype, material_type='GAMEENGINE')
    stage(f"loaded {otype}:{name}")
load('eyes','high-poly','Eyes')
load('eyebrows',os.environ.get('BROW','eyebrow002'),'Eyebrows')
load('eyelashes',os.environ.get('LASH','eyelashes02'),'Eyelashes')
load('hair',os.environ.get('HAIR','ponytail01'),'Hair')
load('teeth','teeth_base','Teeth')
load('tongue','tongue01','Tongue')
load('clothes','female_casualsuit01','Clothes')

# Export copy: bake modifiers/shapekeys, delete helpers, load+interpolate visemes/faceunits
bpy.context.view_layer.objects.active = basemesh
scene.MPFB_EXPO_bake_shapekeys = True
scene.MPFB_EXPO_remove_basemesh = False
scene.MPFB_EXPO_delete_helpers = True
scene.MPFB_EXPO_suffix = '.exp'
scene.MPFB_EXPO_collection = False
scene.MPFB_EXPO_visemes_meta = True
scene.MPFB_EXPO_visemes_microsoft = False
scene.MPFB_EXPO_faceunits_arkit = True
scene.MPFB_EXPO_interpolate = True
scene.MPFB_EXPO_mask_modifiers = 'BAKE'
scene.MPFB_EXPO_subdiv_modifiers = 'BAKE'
bpy.ops.mpfb.export_copy()
stage("export copy created")

# Keep only the export copy set; delete originals, Light, Camera
for o in list(bpy.context.scene.objects):
    if o.name in ('Light','Camera') or ('.exp' not in o.name):
        bpy.data.objects.remove(o)
# Strip suffix from names; armature root must be 'Armature'
for o in bpy.context.scene.objects:
    o.name = o.name.replace('.exp','')
    if o.type == 'ARMATURE':
        o.name = 'Armature'
        o.data.name = 'Armature'
stage(f"final objects: {[o.name for o in bpy.context.scene.objects]}")

# Material alpha modes per MPFB.md: opaque for skin/teeth/tongue/eyes/clothes, MASK for hair/brows/lashes
MASK_MATS = ('eyebrow', 'eyelashes', 'ponytail')
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf:
        continue
    is_mask = any(k in mat.name.lower() for k in MASK_MATS)
    alpha_in = bsdf.inputs['Alpha']
    if is_mask:
        try:
            mat.blend_method = 'CLIP'
            mat.alpha_threshold = 0.5
        except Exception:
            pass
        try: mat.surface_render_method = 'DITHERED'
        except Exception: pass
    else:
        for link in list(alpha_in.links):
            mat.node_tree.links.remove(link)
        alpha_in.default_value = 1.0
        try: mat.blend_method = 'OPAQUE'
        except Exception: pass
        try: mat.surface_render_method = 'DITHERED'
        except Exception: pass
stage("materials fixed: " + str([(m.name, getattr(m,'blend_method','?')) for m in bpy.data.materials]))

# Apply all transforms
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = bpy.context.scene.objects['Armature']
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
stage("transforms applied")

bpy.ops.export_scene.gltf(filepath=os.environ.get('OUT','/home/sandbox/jp-tutor/tools/out/avatar-candidate-v2.glb'),
    export_format='GLB', use_selection=True, export_animations=False)
stage("GLB exported")
# Post-export GLB alphaMode patch: Blender 4.2 exporter emits MASK only from a
# math-compare node chain; production reference has alphaMode MASK on high-poly
# (eyes) and ponytail01. Without MASK the eye cornea alpha clips nothing and the
# iris is covered (white-eye defect). Patch JSON chunk deterministically.
import struct as _st, json as _js
_p=os.environ.get('OUT','/home/sandbox/jp-tutor/tools/out/avatar-candidate-v2.glb')
_d=open(_p,'rb').read()
_ln=_st.unpack_from('<I',_d,12)[0]
_j=_js.loads(_d[20:20+_ln])
for _m in _j.get('materials',[]):
    if _m.get('name') in ('Human.high-poly','Human.ponytail01'):
        _m['alphaMode']='MASK'; _m['alphaCutoff']=0.5
_jsb=_js.dumps(_j,separators=(',',':')).encode(); _jsb+=b' '*((-len(_jsb))%4)
_rest=_d[20+_ln:]
_out=_st.pack('<III',0x46546c67,2,12+8+len(_jsb)+len(_rest))+_st.pack('<II',len(_jsb),0x4e4f534a)+_jsb+_rest
open(_p,'wb').write(_out)
stage("GLB alphaMode MASK patched for eyes+hair")
print("BUILD_COMPLETE", flush=True)
