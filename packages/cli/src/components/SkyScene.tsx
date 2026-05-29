import React from 'react';
import { Text } from 'ink';

/**
 * Claude-Code-style pixel-art sky scene with moon, clouds, and stars.
 * Rendered as pre-formatted block art using Unicode box characters.
 */
export const SkyScene: React.FC = () => {
  // Each line is a row of the sky. We use Text color overrides for moon/clouds.
  return (
    <Text>
      <Text color="gray">     </Text><Text color="white" bold>*</Text><Text color="gray">                                       </Text><Text color="#E8E8E8">█████▓▓░</Text>{'\n'}
      <Text color="gray">                                 </Text><Text color="white" bold>*</Text><Text color="gray">         </Text><Text color="#D0D0D0">███▓░     ░░</Text>{'\n'}
      <Text color="gray">            </Text><Text color="#606060">░░░░░░</Text><Text color="gray">                        </Text><Text color="#B8B8B8">███▓░        </Text>{'\n'}
      <Text color="gray">    </Text><Text color="#505050">░░░</Text><Text color="gray">   </Text><Text color="#707070">░░░░░░░░░░</Text><Text color="gray">                      </Text><Text color="#A0A0A0">███▓░        </Text>{'\n'}
      <Text color="gray">   </Text><Text color="#404040">░░░░░░░░░░░░░░░░░░░░</Text><Text color="gray">    </Text><Text color="white" bold>*</Text><Text color="gray">                </Text><Text color="#888888">██▓░░      ▓</Text>{'\n'}
      <Text color="gray">                                             </Text><Text color="#707070">░▓▓███▓▓░ </Text>{'\n'}
      <Text color="gray"> </Text><Text color="white" bold>*</Text><Text color="gray">                                 </Text><Text color="#505050">░░░░</Text><Text color="gray">               </Text>{'\n'}
      <Text color="gray">                                 </Text><Text color="#606060">░░░░░░░░</Text><Text color="gray">              </Text>{'\n'}
      <Text color="gray">                               </Text><Text color="#707070">░░░░░░░░░░░░░░░░</Text><Text color="gray">        </Text>{'\n'}
      <Text color="gray">       </Text><Text color="#404040">█████████</Text><Text color="gray">               </Text><Text color="#808080">░░░░░░░░░░░░░░░░</Text><Text color="gray">         </Text><Text color="white" bold>*</Text>{'\n'}
      <Text color="gray">      </Text><Text color="#505050">██▄█████▄██</Text><Text color="gray">                        </Text><Text color="white" bold>*</Text><Text color="gray">               </Text>{'\n'}
      <Text color="gray">       </Text><Text color="#606060">█████████</Text><Text color="gray">      </Text><Text color="white" bold>*</Text><Text color="gray">                   </Text>{'\n'}
    </Text>
  );
};

/**
 * Dotted border line used above and below the sky scene.
 */
export const DottedBorder: React.FC<{ width?: number }> = ({ width = 58 }) => {
  return <Text color="#D97736">{'.'.repeat(width)}</Text>;
};

/**
 * Compact sky scene for the welcome-back card (smaller).
 */
export const CompactSkyScene: React.FC = () => {
  return (
    <Text>
      <Text color="gray">     </Text><Text color="white" bold>*</Text><Text color="gray">                                 </Text><Text color="#E8E8E8">████▓▓░</Text>{'\n'}
      <Text color="gray">                         </Text><Text color="white" bold>*</Text><Text color="gray">         </Text><Text color="#C0C0C0">██▓░   ░░</Text>{'\n'}
      <Text color="gray">          </Text><Text color="#606060">░░░░░░</Text><Text color="gray">                    </Text><Text color="#A0A0A0">██▓░      </Text>{'\n'}
      <Text color="gray">   </Text><Text color="#505050">░░░</Text><Text color="gray">   </Text><Text color="#707070">░░░░░░░░</Text><Text color="gray">                  </Text><Text color="#888888">██▓░      </Text>{'\n'}
      <Text color="gray">  </Text><Text color="#404040">░░░░░░░░░░░░░░░░</Text><Text color="gray">  </Text><Text color="white" bold>*</Text><Text color="gray">              </Text><Text color="#707070">█▓░░    ▓</Text>{'\n'}
      <Text color="gray">                                           </Text><Text color="#606060">░▓▓██▓▓░</Text>{'\n'}
      <Text color="gray"> </Text><Text color="white" bold>*</Text><Text color="gray">                               </Text><Text color="#505050">░░░░</Text><Text color="gray">             </Text>{'\n'}
      <Text color="gray">                               </Text><Text color="#606060">░░░░░░░░</Text><Text color="gray">            </Text>{'\n'}
      <Text color="gray">                             </Text><Text color="#707070">░░░░░░░░░░░░░░</Text><Text color="gray">      </Text>{'\n'}
      <Text color="gray">     </Text><Text color="#404040">███████</Text><Text color="gray">             </Text><Text color="#808080">░░░░░░░░░░░░░░</Text><Text color="gray">       </Text><Text color="white" bold>*</Text>{'\n'}
      <Text color="gray">    </Text><Text color="#505050">██▄███▄██</Text><Text color="gray">                      </Text><Text color="white" bold>*</Text><Text color="gray">             </Text>{'\n'}
      <Text color="gray">     </Text><Text color="#606060">███████</Text><Text color="gray">    </Text><Text color="white" bold>*</Text><Text color="gray">                 </Text>{'\n'}
    </Text>
  );
};

/**
 * Stars-only overlay (for layering with other components).
 */
export const Stars: React.FC = () => {
  const positions = [
    { x: 6, y: 0 },
    { x: 34, y: 1 },
    { x: 42, y: 4 },
    { x: 2, y: 6 },
    { x: 55, y: 9 },
    { x: 38, y: 10 },
    { x: 26, y: 11 },
  ];

  return (
    <Text>
      {positions.map((pos, i) => (
        <Text key={i}>
          {' '.repeat(pos.x)}<Text color="white" bold>*</Text>{'\n'}
        </Text>
      ))}
    </Text>
  );
};

/**
 * Mini moon for compact layouts.
 */
export const MiniMoon: React.FC = () => {
  return (
    <Text>
      <Text color="#E8E8E8">    ███▓▓░</Text>{'\n'}
      <Text color="#C8C8C8">  ███▓░  ░░</Text>{'\n'}
      <Text color="#A8A8A8">  ███▓░    </Text>{'\n'}
      <Text color="#888888">  ███▓░    </Text>{'\n'}
      <Text color="#686868">   █▓░░   ▓</Text>{'\n'}
      <Text color="#484848">    ░▓██▓▓░</Text>
    </Text>
  );
};

/**
 * Cloud row using shaded block characters.
 */
export const CloudRow: React.FC<{ width?: number }> = ({ width = 58 }) => {
  return (
    <Text>
      <Text color="#505050">{'░'.repeat(Math.floor(width * 0.15))}</Text>
      <Text color="gray">{' '.repeat(Math.floor(width * 0.1))}</Text>
      <Text color="#606060">{'░'.repeat(Math.floor(width * 0.25))}</Text>
      <Text color="gray">{' '.repeat(Math.floor(width * 0.15))}</Text>
      <Text color="#707070">{'░'.repeat(Math.floor(width * 0.2))}</Text>
      <Text color="gray">{' '.repeat(Math.floor(width * 0.15))}</Text>
    </Text>
  );
};

export default SkyScene;
