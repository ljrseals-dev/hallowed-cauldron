import re,pathlib
r=pathlib.Path(__file__).parent
t=(r/"template.html").read_text()
(r/"index.html").write_text(t)
a=re.sub(r"<!--DL-->.*?<!--/DL-->","",t,flags=re.S)
a=re.sub(r"/\*DL\*/.*?/\*/DL\*/","",a,flags=re.S)
(r/"artifact.html").write_text(a)
print(len(t),len(a),"download" in a.lower() or "a.download" in a)
